# WireViz Preview

A simple extension for Visual Studio Code to preview WireViz YAML files.

![Screenshot](/img/screenshot.png)

## Prerequisites
- [WireViz](https://github.com/wireviz/WireViz) 0.3.2 or later (which requires [Python](https://www.python.org/downloads/) 3.7 or later)
- [Graphviz](https://graphviz.org/download/)

## Running
1. Install extension from the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=NanangP.vscode-wireviz-preview) - or build from source and install locally.
2. In VSCode, open a `Workspace` or `Folder` containing your files.
3. Open a WireViz .yaml file.
4. Use the `WireViz: Preview` button on the editor toolbar (right of tabs).
5. Also keybound by default to <kbd>F8</kbd>.

## Limitations
- Only works on files in a Workspace or Folder opened in VSCode. This will change when [WireViz#320](https://github.com/wireviz/WireViz/issues/320) is implemented.
- Only tested with VSCode on Windows (without WSL). If anyone manages to run this on other platforms, please [let us know](#2).

## Changelog
See [CHANGELOG.md](CHANGELOG.md)

## License
[GPL-3.0](LICENSE) was chosen to match the WireViz license.
