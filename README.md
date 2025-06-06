# C2PA Extension Validator

*NOTE*: this project is a developer preview prototype; it is not meant to be used in production. One goal of the project is to incubate updates and extensions to the C2PA specifications; as such the browser validator might not be fully compliant with the current version of the specifications.

**For an AI-friendly project overview and current status, please refer to the [`AI_START_HERE.md`](AI_START_HERE.md) document.**

This project contains a Edge/Chrome/Firefox browser extension that can validate [C2PA](https://c2pa.org) assets. Our goal is to provide a developer tool to

1. encourage experimentation with C2PA technologies, and
2. enable rapid prototyping of new C2PA features.

The extension must be side-loaded into a browser; see the [setup](#setup) section. The extension doesn't contain a built-it certificate trust list, these must be imported by the user; see the [trust setup](#trust-setup) section.

The extension makes use of [c2pa](https://github.com/contentauth/c2pa-js) library from the [Content Authenticity Initiative](https://github.com/contentauth).

The following asset types can currently be verified by the extension:

* Image: JPEG, PNG, WEBP, AVIF, SVG
* Video: MP4
* Audio: MP3, WAV

## Setup

The extension can either be downloaded from this repository or built locally.

### Download instructions

Either download and unzip the last stable version ([dist-chrome.zip](https://github.com/microsoft/c2pa-extension-validator/releases/download/v0.1.3/dist-chrome.zip), [dist-firefox.zip](https://github.com/microsoft/c2pa-extension-validator/releases/download/v0.1.3/dist-firefox.zip)) or the latest dev one from the [Build Browser Extension](https://github.com/microsoft/c2pa-extension-validator/actions/workflows/ci.yml) Action CI (click the latest workflow run, and see the Artifacts section).

### Build instructions

As a prerequisite, install the [pnpm](https://pnpm.io/installation) package manager.

Firstly, install the dependencies:
```bash
pnpm install
```

Secondly, build the extension:
```bash
pnpm run build
```
The Edge/Chrome `manifest.json` file is located in `dist/chrome`. The Firefox `manifest.json` file is located at `dist/firefox`.

### Install the extension in a browser

Follow the side-loading instruction for your browser to load the extension:

* [Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading)
* [Chrome](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked)
* [Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)

To enable the extension in Firefox, you need to grant specific user permissions:

  1. Open the Firefox menu and select `Add-ons`.
  2. Click on the `Extensions` tab.
  3. Find the C2PA Extension Validator and click `Permissions`.
  4. Enable the `Access your data for all websites` permission.

### Test the extension

Visit these pages to test the extension:

* [Public test page](./test/public-tests.html), containing valid assets from various test issuers
* [Unit test page](./test/unit-tests.html), containing valid, untrusted, and invalid assets of different media types
* [Origin test page](./test/origin-tests.html), containing assets from [project Origin](https://www.originproject.info/) publishers

## Usage

### Trust Setup

Users must import a list of trusted signers or add them individually as trust anchors for C2PA assets to be validated properly; the trust lists must be formatted as [described here](https://github.com/christianpaquin/c2pa-explorations/blob/main/trust-lists/trust-lists.md). This can be done through the `Options` tab of the browser extension's toolbar popup window.

### Asset Validation

*Note*: the underlying C2PA library that does the certificate validation does not currently accept trust anchors to create complete X.509 chains; the full certificate chain must therefore be present in a C2PA manifest to be considered valid.

The extension automatically scans the current HTML page for C2PA assets and validates them. An icon representing the validation status is then overlaid on the asset:

|                                                                  |                                                                                     |
|------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| <img src="./public/icons/cr.svg" alt="valid icon" width="50">    | a valid asset, i.e. a well-formed C2PA manifest signed by a trusted issuer          |
| <img src="./public/icons/cr!.svg" alt="warning icon" width="50"> | an untrusted asset, i.e., a well-formed C2PA manifest signed by an unknown issuer |
| <img src="./public/icons/crx.svg" alt="invalid icon" width="50"> | a invalid asset                                                                     |

See the [C2PA specification](https://c2pa.org/specifications/specifications/2.0/specs/C2PA_Specification.html#_statements_by_a_validator) for the definition of well-formed manifests and trusted signers.

Note that untrusted *warning* icon is not currently specified in the [C2PA UX recommendations](https://c2pa.org/specifications/specifications/1.4/ux/UX_Recommendations.html).

## Extension Limitations

The extension currently has a few limitations that will be addressed in future releases:

* **Icon and overlay placement**: The extension's icon and overlay may not be placed correctly on all media types or in all scenarios.
* **Malicious web pages**: Currently, there are limited countermeasures against web pages that would spoof, alter, or remove the extension's output.
* **Accessibility**: The extension's UI elements are not fully accessible.
* **Conflict with other extensions**: The extension may conflict with other extensions that modify the DOM or media elements. It is currently unknown which extensions may conflict with this extension.
* **Partial media support**: The extension currently supports only a subset of media types supported by the underlying C2PA validation library.
* **Firefox compatibility**: here are known issues and workarounds for Firefox:
  * **Popup Window Bug**: Firefox has a known issue where the popup window closes immediately after opening the trust list file picker dialog, preventing the trust list from being applied. To work around this:
    1. Open a new tab and navigate to `about:config`.
    2. Search for `ui.popup.disable_autohide` and set it to `true`. **Note**: This change keeps the popup window open until you press the [esc] key.
  * **Web Worker Script Loading**: The `c2pa` library attempts to load scripts into a web worker from a blob-data URL, which Firefox blocks by default without a configurable way to allow it. A patch cof `node_modules/c2pa/dist/c2pa.esm.js:createPoolWrapper` allows loading from a local extension URL instead. Ensure the patch is applied by running `pnpm install`, as `npm install` does not apply it. Be cautious when updating the `c2pa` library as it may require reapplying or reconstructing the patch.
  * **Messaging Limitations** Firefox extension messaging has stricter limitations compared to Chrome/Edge. Content/injected scripts cannot directly pass messages to each other; they must route messages via the background script. This may affect functionality if you modify the extension, as messaging behavior that works in Chrome/Edge might not work in Firefox.

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit <https://cla.opensource.microsoft.com>.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
