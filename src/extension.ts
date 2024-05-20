import aspawn from "await-spawn";
import path from "path";
import semver from "semver";
import vscode, {window, TextDocument, Uri, WebviewOptions} from "vscode";

enum MsgType {
	Err =  "🛑 ERROR:",
	Warn = "🚧 WARNING:",
	Info = "💬",
}

/** Characters representing the desired output format. See `wireviz --help` for complete list. */
const WvOutFormatChars = {
	"svg": "s",
	"png": "p",
};
/** This extension is only compatible with the specified WV version or above. */
const WvMinVersion = "0.4.0";
/** Regex to capture the WV executable version in the output of `wireviz -V` */
const VersionRegex: RegExp = /WireViz ([\d\.]+)/;
/** Title of the VSCode Output window used to log our errors. */
const OutputLog = vscode.window.createOutputChannel("WireViz Preview", "log");

let wvpanel: vscode.WebviewPanel | undefined;
let isRunning = false;

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand("wireviz.showPreview", async() => await showPreview()),
		vscode.workspace.onDidSaveTextDocument(onDocumentSaved)
	);
}

export async function deactivate() {
	wvpanel?.dispose();
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
		createOrShowPreviewPanel(doc);
	
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
	
		const outPathRel = getConfig("outputPath", null) ?? ".";
		const outPath = path.join(path.dirname(doc.fileName), outPathRel);
	
		const inputFileExt = new RegExp(`${path.extname(doc.fileName)}$`);
		const outExt = getConfig("previewFormat", "svg");
		const outFile = path
			.join(outPath, path.basename(doc.fileName))
			.replace(inputFileExt, `.${outExt}`);
	
		const outFormat = WvOutFormatChars[outExt];
	
		try {
			// WireViz 0.4 revamped -o to be only the output dir name, added -O for file basename,
			// and added -f to specify output file formats.
			// See: https://github.com/wireviz/WireViz/blob/v0.4/docs/CHANGELOG.md
			const process = await aspawn("wireviz", [doc.fileName, "-o", outPath, "-f", outFormat]);
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

/** Shows the preview panel, or create one if it does not yet exists. */
function createOrShowPreviewPanel(doc: TextDocument | undefined) {
	const docColumn = window.activeTextEditor?.viewColumn;

	if (wvpanel) {
		wvpanel.webview.options = getWvOptions(doc);
		if (!wvpanel.visible) {
			wvpanel.reveal();
		}
	}
	else {
		wvpanel = window.createWebviewPanel(
			"WireVizPreview",
			"WireViz Preview",
			vscode.ViewColumn.Beside,
			getWvOptions(doc)
		);
		wvpanel.onDidDispose(() => wvpanel = undefined); // Delete panel on dispose

		// Return focus to text document. A little hacky.
		if (doc && window.activeTextEditor && docColumn !== wvpanel.viewColumn) {
			window.showTextDocument(doc, docColumn);
		}
	}
}

function getConfig<T>(section: string, defaultValue: T): T {
	return vscode.workspace // Scoped config. Workspace > User > Global.
		.getConfiguration("wireviz")
		.get(section, defaultValue);
}

function getWvOptions(doc: TextDocument | undefined): WebviewOptions {
	// By default, Webview can only show files (our generated img) under the Workspace/Folder.
	// If we want to show files elsewhere, we have to specify it using `localResourceRoots`.
	return {
		enableScripts: false,
		localResourceRoots: (doc && isFileOutsideWorkspace(doc))
			? [Uri.file(path.dirname(doc.fileName))]
			: undefined // when undefined, `localResourceRoots` defaults to WS/Folder root.
	};
}

function isFileOutsideWorkspace(doc: TextDocument): boolean {
	return vscode.workspace.getWorkspaceFolder(doc.uri) === undefined;
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
	if (wvpanel) {
		wvpanel.webview.html = `
			<html><body style="${bodyStyle}">
				${msgType} ${msg.replaceAll("\n", "<br/>")}
			</body></html>`;
	}

	const curTime = (new Date).toLocaleTimeString(undefined, {hour12: false});
	switch (msgType) {
		case MsgType.Warn: {
			OutputLog.appendLine(`${curTime} WARNING: ${msg}`);
			OutputLog.show();
		}
		case MsgType.Err: {
			OutputLog.appendLine(`${curTime} ERROR: ${msg}`);
			OutputLog.show();
		}
	}
}

function showImg(imgFileName: string) {
	if (wvpanel) {
		const uri = Uri.file(imgFileName);
		const webviewUri = wvpanel.webview.asWebviewUri(uri);
		wvpanel.webview.html = `
			<html><body style="${bodyStyle}">
				<img src="${webviewUri}" style="${imgStyle}" alt="Diagram">
			</body></html>`;
	}
}

const bodyStyle = `
	background-color: transparent;
	font-size: medium;
`;

const imgStyle = `
	width: 100%;
`;
