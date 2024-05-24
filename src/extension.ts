import aspawn from "await-spawn";
import path from "path";
import semver from "semver";
import vscode, {window, TextDocument, Uri, WebviewOptions} from "vscode";

enum MsgType {
	Debug = "DEBUG",
	Info = "INFO",
	Warn = "WARNING",
	Err =  "ERROR",
}

/** This extension is only compatible with the specified WV version or above. */
const WvMinVersion = "0.4.0";
/** Regex to capture the WV executable version in the output of `wireviz -V` */
const VersionRegex: RegExp = /WireViz ([\d\.]+)/;
/** Title of the VSCode Output window used to log our errors. */
const OutputLog = vscode.window.createOutputChannel("WireViz Preview", "log");
/** Custom WV arguments from configuration */
type ConfiguredArgs = {
	outputFormats: string;
	outputDir: string;
	outputName: string | undefined;
	prepend: string | undefined;
};

let viewPanel: vscode.WebviewPanel | undefined;
let isRunning = false;

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand("wireviz.showPreview", async() => await showPreview()),
		vscode.workspace.onDidSaveTextDocument(onDocumentSaved)
	);
}

export async function deactivate() {
	viewPanel?.dispose();
}

async function onDocumentSaved(evt: TextDocument) {
	const activeDoc = window.activeTextEditor?.document;

	if (getConfig("refreshPreviewOnSave", true)
			&& evt.uri === activeDoc?.uri
			&& activeDoc?.languageId === "yaml") {
		await showPreview();
	}
}

async function showPreview() {
	// Very basic locking to prevent concurrent calls, when someone accidentally
	// re-triggers the event before previous operations have finished.
	if (isRunning) {
		return;
	}
	isRunning = true;

	try {
		const doc = window.activeTextEditor?.document;
	
		// Ensure we have a panel so we can show either output or errors
		createOrShowPreviewPanel(doc, "");
	
		show(MsgType.Info, "Generating diagram...");

		if (!doc || !isWirevizYamlFile(doc)) {
			show(MsgType.Err, "Not a WireViz YAML");
			return;
		}
	
		if (await isAnyWirevizError()) {
			return;
		}
	
		// Saving now. If you don't want to, too bad. WireViz doesn't work with stdin.
		if (doc.isDirty) {
			doc.save();
		}
	
		const cfgArgs = getArgsFromConfig(doc.fileName);
		const wvArgs = getWvCmdlineArgs(doc.fileName, cfgArgs);
		const outFile = getOutputFileFullpath(doc.fileName, cfgArgs);
		createOrShowPreviewPanel(doc, cfgArgs.outputDir); // Tell panel we have external resources in the output dir

		try {
			show(MsgType.Debug, "wireviz ".concat(wvArgs.join(" ")));
			const process = await aspawn("wireviz", wvArgs);
			showImg(outFile);
		} catch (e: any) {
			if (e.stderr) {
				show(MsgType.Err, e.stderr.toString());
			} else if (e) {
				show(MsgType.Err, `${e.name}${e.message}`);
			}
		}
	} finally {
		isRunning = false;
	}
}

/** Ensures we can spawn WireViz, and that it has a version compatible with this extension. */
async function isAnyWirevizError(): Promise<boolean> {
	try {
		const versionProc = await aspawn("wireviz", ["-V"]);

		const verText = VersionRegex.exec(versionProc.toString())?.at(1) ?? "0.0";
		const verSemantic = semver.coerce(verText)!;
		if (semver.lt(verSemantic, WvMinVersion)) {
			show(MsgType.Err, `This extension only supports WireViz version ${WvMinVersion} or higher. Found version ${verText}.`);
			return true;
		}
	} catch (e: any) {
		if (e.stderr) {
			show(MsgType.Err, e.stderr.toString());
		}
		else if (e) {
			show(MsgType.Err, `${e.name}${e.message}\n  Cannot call wireviz.\n  Please ensure WireViz and Graphviz are installed and can be called from the terminal.`);
		}
		return true;
	}

	return false;
}

function getArgsFromConfig(inputFile: string): ConfiguredArgs {
	const outputName = getConfig<string>("outputName", undefined)?.trim();

	let prepend = getConfig<string>("prepend", undefined)?.trim();
	if (prepend && !path.isAbsolute(prepend)) {
		prepend = path.join(path.dirname(inputFile), prepend);
	}
	
	const outputFormats = getConfig("outputFormats", "")!.trim()
		.concat("s"); // force svg

	let outputDir = getConfig("outputDir", "")!.trim();
	if (!path.isAbsolute(outputDir)) {
		// Get full path relative to the input dir
		outputDir = path.join(path.dirname(inputFile), outputDir);
	}
	
	return {outputFormats, outputDir, outputName, prepend};
}

function getWvCmdlineArgs(inputFile: string, cfgArgs: ConfiguredArgs) {
	let cmdArgs = ["-f", cfgArgs.outputFormats, "-o", cfgArgs.outputDir];
	if (cfgArgs.outputName) {
		cmdArgs.push("-O", cfgArgs.outputName);
	}
	if (cfgArgs.prepend) {
		cmdArgs.push("-p", cfgArgs.prepend);
	}
	cmdArgs.push(inputFile);
	return cmdArgs;
}

function getOutputFileFullpath(inputFile: string, cfgArgs: ConfiguredArgs) {
	const inputFileExt = new RegExp(`${path.extname(inputFile)}$`);
	return path.join(cfgArgs.outputDir, cfgArgs.outputName
		? `${cfgArgs.outputName}.svg`
		: path.basename(inputFile).replace(inputFileExt, ".svg")
	);
}

/** Shows the preview panel, or create one if it does not yet exists. */
function createOrShowPreviewPanel(doc: TextDocument | undefined, outputDir: string) {
	const docColumn = window.activeTextEditor?.viewColumn;

	if (viewPanel) {
		viewPanel.webview.options = getWebviewOptions(outputDir);
		if (!viewPanel.visible) {
			viewPanel.reveal();
		}
	}
	else {
		viewPanel = window.createWebviewPanel(
			"WireVizPreview",
			"WireViz Preview",
			vscode.ViewColumn.Beside,
			getWebviewOptions(outputDir)
		);
		viewPanel.onDidDispose(() => viewPanel = undefined); // Delete panel on dispose

		// Return focus to text document. A little hacky.
		if (doc && window.activeTextEditor && docColumn !== viewPanel.viewColumn) {
			window.showTextDocument(doc, docColumn);
		}
	}
}

function getConfig<T>(section: string, defaultValue: T | undefined): T | undefined {
	return vscode.workspace // Scoped config. Workspace > User > Global.
		.getConfiguration("wireviz")
		.get(section, defaultValue);
}

function getWebviewOptions(outputDir: string): WebviewOptions {
	// By default, Webview can only show files (our generated img) under the Workspace/Folder.
	// If we want to show files elsewhere, we have to specify it using `localResourceRoots`.
	return {
		enableScripts: false,
		localResourceRoots: (isOutsideWorkspace(outputDir))
			? [Uri.file(outputDir)]
			: undefined // when undefined, `localResourceRoots` defaults to WS/Folder root.
	};
}

function isOutsideWorkspace(dir: string): boolean {
	return vscode.workspace.getWorkspaceFolder(Uri.file(dir)) === undefined;
}

// Rudimentary check for the minimum required contents of a WV yaml.
const isWvContent: RegExp = /connections:|cables:|connectors:/gm;
function isWirevizYamlFile(doc: TextDocument) {
	return doc.languageId === "yaml"
		&& doc.getText()?.match(isWvContent)?.length === 3;
}

/** Shows message of the specified type on the Webview.
 *  The message will also be printed to an Output window.
 */
function show(msgType: MsgType, msg: string) {
	if (viewPanel && msgType !== MsgType.Debug) {
		viewPanel.webview.html = `
			<html><head>${ViewPanelCss}</head><body>
				${msgType}: ${msg.replaceAll("\n", "<br/>")}
			</body></html>`;
	}

	const curTime = (new Date).toLocaleTimeString(undefined, {hour12: false});
	OutputLog.appendLine(`${curTime} ${msgType}: ${msg}`);
	
	if ([MsgType.Warn, MsgType.Err].includes(msgType)) {
		OutputLog.show();
	}
}

function showImg(imgFileName: string) {
	if (viewPanel) {
		const uri = Uri.file(imgFileName);
		const webviewUri = viewPanel.webview.asWebviewUri(uri);
		viewPanel.webview.html = `
			<html><head>${ViewPanelCss}</head><body>
				<figure>
					<img src="${webviewUri}" alt="Diagram">
					<figcaption>${imgFileName}</figcaption>
				</figure>
			</body></html>`;
	}
}

const ViewPanelCss = `
<style>
	body { background-color: transparent; font-size: medium; padding: 5pt; }
	figure, img { width: 100%; padding: 0; margin: 0; }
	figcaption { font-size: small; }
</style>
`;
