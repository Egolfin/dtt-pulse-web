# DTT Pulse Web

DTT Pulse Web is a browser-only Dials & Talk Time dashboard. It runs from a normal web link and has no Outreach connection, server, login, database, or installed application requirement.

## What it does

- Imports Outreach call-list CSV files.
- Calculates DTT as verified call minutes + configured credit per eligible dial + manual minutes.
- Shows overview, DTT matrix, call activity, manual time, team members, settings, CSV export, and print/PDF output.
- Deduplicates later imports using the call ID, so re-importing the same export does not add DTT again.
- Stores the imported calls, manual entries, roster, and settings in the browser's local storage.

## Publish it on GitHub Pages

1. Create a new **private GitHub repository** named `dtt-pulse-web`.
2. Upload the contents of this folder to the repository root. Do not upload the old `dtt-pulse` server folder.
3. In GitHub, go to **Settings → Pages** and set the source to **GitHub Actions**.
4. Push the `main` branch. The included workflow publishes the site and GitHub displays the URL in the Pages settings.
5. Open that URL in your work browser and import your Outreach CSV.

The dashboard is a static website, so GitHub Pages can host it directly. [GitHub Pages documentation](https://docs.github.com/en/pages)

## How to use it

1. Open the web link.
2. Select **Import calls** and upload an Outreach call-list CSV.
3. Review the call count, duration, dial credits, total DTT, and any warnings.
4. Use **Manual time** to add Zoom, Google Meet, or other qualifying work.
5. Use **Team members** and **Workspace settings** to maintain the roster and rules.
6. Export the report when needed.

Use a current CSV with stable call IDs. `Duration in Seconds` is the preferred duration field.

## Storage behavior

The data is stored **only in the browser profile that imports it**. It does not sync to another computer, browser, or teammate. Clearing browser site data also clears this dashboard’s stored data. Export reports regularly and keep your source CSV files.

GitHub Pages serves the web app; it does not receive or store the CSV contents that you import after the page has loaded.

## Included files

| File | Purpose |
| --- | --- |
| `index.html` | Web app entry page |
| `static-adapter.js` | Browser-only import, storage, settings, and export layer |
| `domain.js` | Shared DTT calculations and CSV validation |
| `app.js` / `styles.css` | Dashboard interface |
| `.github/workflows/pages.yml` | GitHub Pages deployment workflow |

No Outreach connector is included in this version.
