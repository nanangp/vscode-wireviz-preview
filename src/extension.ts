import childProcess from "child_process";
import path from "path";
import vscode from "vscode";
import {window, TextDocument, Uri} from "vscode";

enum MsgType {
	Err =  "🛑 ERROR:",
	Warn = "🚧 WARNING:",
	Info = "💬",
}

const OutputSubfolder = "output";

let wvpanel: vscode.WebviewPanel | undefined;
let currResourceRoots: Uri[] | undefined;

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand("wireviz.showPreview", showPreview),
		vscode.workspace.onDidSaveTextDocument(onDocumentSaved)
	);
}

export function deactivate() {
	wvpanel?.dispose();
}

function onDocumentSaved(evt: TextDocument) {
	const activeDoc = window.activeTextEditor?.document;

	if (getConfig("refreshPreviewOnSave", true)
			&& evt.uri === activeDoc?.uri
			&& activeDoc?.languageId === "yaml") {
		showPreview();
	}
}

function showPreview() {
	const doc = window.activeTextEditor?.document;

	// Ensure we have a panel so we can show either output or errors
	createOrShowPreviewPanel(doc);

	if (!doc || !isWirevizYamlFile(doc)) {
		show(MsgType.Err, "Not a WireViz YAML");
		return;
	}

	// Saving now. If you don't want to, too bad. WireViz doesn't work with stdin.
	if (doc.isDirty) {
		doc.save();
	}

	show(MsgType.Info, "Generating diagram...");

	let outFileNoExt = path
		.join(path.dirname(doc.fileName), OutputSubfolder, path.basename(doc.fileName))
		.replace(path.extname(doc.fileName), "");

	const process = childProcess.spawn("wireviz", [doc.fileName, "-o", outFileNoExt]);

	// 'error' is when we can't run wireviz.
	process.on("error", e => show(MsgType.Err, `
		${e.name}${e.message}<br/><br/>
		Cannot invoke wireviz.<br/>
		Please ensure WireViz and Graphviz are installed and invokable from the terminal.`));
	// 'stderr' & 'stdout' are errors during processing.
	const errors: string[] = [];
	process.stderr.on("data", d => errors.push(d));
	process.stdout.on("data", d => errors.push(d));

	process.on("exit", (code) => {
		if (code === 0) {
			const imgFormat = getConfig("previewFormat", "svg");
			const imgFileName = `${outFileNoExt}.${imgFormat}`;
			showImg(imgFileName);
		} else {
			const errTxt = errors.join("\n");
			show(MsgType.Err, errTxt);
		}
	});
}

/** Shows the preview panel, or create one if it does not yet exists. */
function createOrShowPreviewPanel(doc: TextDocument | undefined) {
	// By default, Webview can only show files (our generated img) under the Workspace/Folder.
	// If we want to show files elsewhere, we have to specify it using `localResourceRoots`.
	// Unfortunately it's readonly, so we have to recreate the Webview when it changes.
	const resourceRoots = doc ? getResourceRoots(doc) : undefined;

	// If we have to dispose an existing one, we'd like to recreate at the same location
	const wvpanelColumn = wvpanel?.viewColumn;
	const docColumn = window.activeTextEditor?.viewColumn;

	if (resourceRoots !== currResourceRoots) {
		wvpanel?.dispose();
		currResourceRoots = resourceRoots;
	}

	if (!wvpanel) {
		wvpanel = window.createWebviewPanel(
			"WireVizPreview",
			"WireViz Preview",
			wvpanelColumn ?? vscode.ViewColumn.Beside,
			{
				enableScripts: false,
				localResourceRoots: currResourceRoots
			}
		);
		wvpanel.onDidDispose(() => wvpanel = undefined); // Delete panel on dispose

		// Return focus to text document. A little hacky.
		if (doc && window.activeTextEditor && docColumn !== wvpanel.viewColumn) {
			window.showTextDocument(doc, docColumn);
		}
	} else if (!wvpanel.visible) {
		wvpanel.reveal();
	}
}

function getConfig<T>(section: string, defaultValue: T) {
	return vscode.workspace  // Scoped config. Workspace > User > Global.
		.getConfiguration("wireviz")
		.get(section, defaultValue);
}

function getResourceRoots(doc: TextDocument): Uri[] | undefined {
	if (isFileOutsideWorkspace(doc)) {
		return [Uri.file(path.dirname(doc.fileName))];
	}
	return undefined; // when undefined, `localResourceRoots` defaults to WS/Folder root.
}

function isFileOutsideWorkspace(doc: TextDocument): boolean {
	return vscode.workspace.getWorkspaceFolder(doc.uri) === undefined;
}

// Rudimentary check for the minimum required contents of a WV yaml.
const isWv: RegExp = /connections:|cables:|connectors:/gm;
function isWirevizYamlFile(doc: TextDocument) {
	return doc.languageId === "yaml"
		&& doc.getText()?.match(isWv)?.length === 3;
}

/** Shows message of the specified type on the Webview.
 *  If the panel doesn't exist, the message will be ouput to the debug console.
 */
function show(msgType: MsgType, msg: string) {
	if(wvpanel) {
		wvpanel.webview.html = `
			<html><body style="${bodyStyle}">
				${msgType} ${msg.replaceAll("\n", "<br/>")}
			</body></html>`;
	} else {
		console.log(`${msgType} ${msg.replaceAll("<br/>", "\n")}`);
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
