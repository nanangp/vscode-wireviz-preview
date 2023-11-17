# WireViz Preview

A simple extension for Visual Studio Code to preview WireViz YAML files.

![Screenshot](/img/screenshot.png)

## Prerequisites
- Install extension from the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=NanangP.vscode-wireviz-preview) - or build from source.
- [WireViz](https://github.com/wireviz/WireViz) 0.3.2 or later; which requires [Python](https://www.python.org/downloads/) 3.7 or later, and [Graphviz](https://graphviz.org/download/)

## Running
1. Open a WireViz YAML file.
2. Use the `WireViz: Preview` button on the editor toolbar (right of tabs),
   or using the default <kbd>F8</kbd> shortcut key.
4. Once the preview is open, it will refresh every time you save the file.  
   This behaviour can be disabled by setting `"wireviz.refreshPreviewOnSave": false`.

## Configuration
Defaults are the first of the "Possible values" below.
Config UI | settings.json | Possible values | Description
---|---|---|---
Wireviz: Refresh Preview On Save | `wireviz.refreshPreviewOnSave` | `true`, `false` | Automatically refreshes preview on document save
Wireviz: Output Path | `wireviz.outputPath` | `"output"`, `null` | When set, generates output files in an `/output` subdirectory. When `null`, output to the same location as the input file.
Wireviz: Preview Format | `wireviz.previewFormat` | `"svg"`, `"png"` | Selects output file to be displayed in the preview window.


## ⚠ Limitations
- If you have an external image in your wire harness (i.e. an `image:` node),
  you need to set:
  - `"wireviz.previewFormat": "png"` (the WebView in VSCode won't show images on an SVG), and
  - `"wireviz.outputPath": null` (WireViz v0.3.2 [throws an error](https://github.com/wireviz/WireViz/issues/284) outputting to a path other than the source, if you use images)

## Changelog
See [CHANGELOG.md](CHANGELOG.md)

## License
[GPL-3.0](https://spdx.org/licenses/GPL-3.0-only.html) was chosen to match the WireViz license.
