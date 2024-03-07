import childProcess from "child_process";
import path from "path";
import vscode from "vscode";
import {window, TextDocument, Uri, WebviewOptions} from "vscode";

enum MsgType {
	Err =  "🛑 ERROR:",
	Warn = "🚧 WARNING:",
	Info = "💬",
}

let wvpanel: vscode.WebviewPanel | undefined;

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

	const outPath = getConfig("outputPath", null) ?? ".";
	let outFileNoExt = path
		.join(path.dirname(doc.fileName), outPath, path.basename(doc.fileName))
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

function getConfig<T>(section: string, defaultValue: T) {
	return vscode.workspace  // Scoped config. Workspace > User > Global.
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
