# WireViz Preview

A simple extension for Visual Studio Code to preview WireViz YAML files.

![Screenshot](/img/screenshot.png)

## Prerequisites
- Install extension from the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=NanangP.vscode-wireviz-preview) - or build from source.
- [WireViz](https://github.com/wireviz/WireViz) **0.4.0** or later; which requires [Python](https://www.python.org/downloads/) 3.7 or later, and [Graphviz](https://graphviz.org/download/)

## Running
1. Open a WireViz YAML file.
2. Use the `WireViz: Preview` button on the editor toolbar (right of tabs),
   or using the default <kbd>F8</kbd> shortcut key.
4. Once the preview is open, it will refresh every time you save the file.
   This behaviour can be disabled by setting `"wireviz.refreshPreviewOnSave": false`.

## Configuration
The first (bolded) of the "Possible values" is the default if unspecified.
| Config UI | settings.json | Possible values | Description |
| --------- | ------------- | --------------- | ----------- |
| Refresh Preview On Save | `wireviz.refreshPreviewOnSave` | **`true`**, `false` | Automatically refreshes preview on document save. |
| Output Path | `wireviz.outputPath` | blank, or relative path name | When set, generates output files in the specified path *relative* to the input file. When empty, output to the same path as the input file. |
| Preview Format | `wireviz.previewFormat` | **`"svg"`**, `"png"` | Selects output file to be displayed in the preview window. |


## Troubleshooting
- Please make sure you're running WireViz 0.4 or above. Their new command line options are incompatible with 0.3 and below.
- If you are running into issues after upgrading to WireViz 0.4, try running WireViz against your input file from the terminal:
   - If it works on the terminal but not through the extension, please report it as a new issue here.
   - If the terminal also throws an error, please downgrade WireViz to `0.3`, and [downgrade this extension](https://code.visualstudio.com/updates/v1_30#_install-previous-versions) to `1.0.x`, and wait until they fix it.

## Changelog
See [CHANGELOG.md](CHANGELOG.md)

## License
[GPL-3.0](https://spdx.org/licenses/GPL-3.0-only.html) was chosen to match the WireViz license.
