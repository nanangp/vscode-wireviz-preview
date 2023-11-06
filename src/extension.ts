import * as childProcess from "child_process";
import * as path from "path";
import * as vscode from 'vscode';
import {window} from 'vscode';

enum MsgType {
	Err =  '🛑 ERROR:',
	Warn = '🚧 WARNING:',
	Info = '💬',
}

const OutputSubfolder = "output";
const ImgFormat = ".svg";

let wvpanel: vscode.WebviewPanel | undefined;
let currResourceRoots: vscode.Uri[] | undefined;

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('wireviz.showPreview', showPreview)
	);
}

export function deactivate() {
	wvpanel?.dispose();
}

function showPreview() {
	const doc = window.activeTextEditor?.document;

	// Ensure we have a panel so we can show either output or errors
	createOrShowPreviewPanel(doc);

	if (!doc || !isWirevizYamlFile(doc)) {
		showMsg(MsgType.Err, `Not a WireViz YAML`);
		return;
	}

	// Saving now. If you don't want to, too bad. WireViz doesn't work with stdin.
	if (doc.isDirty) {
		doc.save();
	}

	showMsg(MsgType.Info, `Generating diagram...`);

	let outFileNoExt = path
		.join(path.dirname(doc.fileName), OutputSubfolder, path.basename(doc.fileName))
		.replace(path.extname(doc.fileName), '');

	const process = childProcess.spawn('wireviz', [doc.fileName, "-o", outFileNoExt]);

	// 'error' is when we can't run wireviz.
	process.on("error", e => showMsg(MsgType.Err, `
		${e.name}${e.message}<br/><br/>
		Cannot invoke wireviz.<br/>
		Please ensure WireViz and Graphviz are installed and invokable from the terminal.`));
	// 'stderr' & 'stdout' are errors during processing.
	const errors: string[] = [];
	process.stderr.on("data", d => errors.push(d));
	process.stdout.on("data", d => errors.push(d));

	process.on('exit', (code) => {
		if (code === 0) {
			const imgFileName = `${outFileNoExt}${ImgFormat}`;
			showImg(imgFileName);
		} else {
			const errTxt = errors.join("<br/>").replaceAll('\n', '<br/>');
			showMsg(MsgType.Err, errTxt);
		}
	});
}

function createOrShowPreviewPanel(doc: vscode.TextDocument | undefined) {
	// By default, Webview can only show files (our generated SVG) under the Workspace/Folder.
	// If we want to show files elsewhere, we have to specify it using `localResourceRoots`.
	// Unfortunately it's readonly, so we have to recreate the Webview when it changes.
	const resourceRoots = doc ? getResourceRoots(doc) : undefined;
	if (resourceRoots !== currResourceRoots) {
		wvpanel?.dispose();
		currResourceRoots = resourceRoots;
	}

	if (!wvpanel) {
		wvpanel = window.createWebviewPanel(
			'WireVizPreview',
			'WireViz Preview',
			vscode.ViewColumn.Beside,
			{
				enableScripts: false,
				localResourceRoots: currResourceRoots
			}
		);
		wvpanel.onDidDispose(() => wvpanel = undefined); // Delete panel on dispose
	} else if (!wvpanel.visible) {
		wvpanel.reveal();
	}
}

function getResourceRoots(doc: vscode.TextDocument): vscode.Uri[] | undefined {
	if (isFileOutsideWorkspace(doc)) {
		return [vscode.Uri.file(path.dirname(doc.fileName))];
	}
	return undefined; // when undefined, `localResourceRoots` defaults to WS/Folder root.
}

function isFileOutsideWorkspace(doc: vscode.TextDocument): boolean {
	return vscode.workspace.getWorkspaceFolder(doc.uri) === undefined;
}

// Rudimentary check for the minimum required contents of a WV yaml.
const isWv: RegExp = /connections:|cables:|connectors:/gm;
function isWirevizYamlFile(doc: vscode.TextDocument) {
	return doc.languageId === 'yaml'
		&& doc.getText()?.match(isWv)?.length === 3;
}

function showMsg(msgType: MsgType, msg: string) {
	if(wvpanel) {
		wvpanel.webview.html = `<html><body style="${bodyStyle}">${msgType} ${msg}</body></html>`;
	};
}

function showImg(imgFileName: string) {
	if (wvpanel) {
		const uri = vscode.Uri.file(imgFileName);
		const webviewUri = wvpanel.webview.asWebviewUri(uri);
		wvpanel.webview.html = `<!DOCTYPE html>
			<html><body style="${bodyStyle}">
				<img src="${webviewUri}" style="${imgStyle}" alt="Diagram">
			</body></html>
		`;
	}
}

const bodyStyle = `
	background-color: transparent;
	font-size: medium;
`;

const imgStyle = `
	width: 100%;
`;
