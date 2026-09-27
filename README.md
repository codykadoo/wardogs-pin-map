# Wardogs Pin Map

A second-screen map for the game WARDOGS. You place a mortar and target pins by hand. The page shows distance, bearing, mils, and whether the target is in range.

It does not touch the game. No memory reading, no file reading, no packet capture, no screen reading, no overlay on the game window, and no input automation. Everything you see was typed or clicked by you, and it stays in this browser's `localStorage`. There is no account and no server-side save.

## Setup

You need [Node.js 22](https://nodejs.org/) or newer.

```bat
git clone https://github.com/codykadoo/wardogs-pin-map.git
cd wardogs-pin-map
npm install
npm run dev
```

Vite prints a local address, usually `http://localhost:5173`. Open that on a second monitor or a phone on the same network (`--host` is already on, so use the Network URL Vite prints).

`npm test` checks the coordinate math. `npm run build` writes a static site to `dist`.

## Map images

Three maps load from `public/maps/`:

| Map | File |
| --- | --- |
| Bakurani | `public/maps/bakurani.png` |
| Ozeti | `public/maps/ozeti.png` |
| Zestafona | `public/maps/zestafona.png` |

Bakurani and Zestafona in the repo are placeholders so the page runs before you add a screenshot. Ozeti is a tactical screenshot. Replace a file with your own picture of that map, keeping the same file name. North should be up. Use a PNG (or change the path in `src/wardogs/maps.ts` if you prefer another format the browser can show).

Do not download, hotlink, or copy map images or tiles from other sites. After you drop a file in, restart `npm run dev` if the browser is still showing the old picture, then calibrate.

Until you calibrate, each image is stretched to fill a 16 km by 16 km frame. Positions are stored in meters of game coordinates, not image pixels.

## Grid

Columns run left to right and rows run bottom to top, both labeled 1 through 16. Square `7-12` is the kilometer from 6 km to 7 km east and 11 km to 12 km north. Typing that reference places a point in the center of the square: X 6,500 m, Y 11,500 m.

The corner readout shows the cursor as X/Y in meters plus the grid reference. The 1 km grid can be toggled. The 100 m grid is drawn only when you are zoomed in, and it has its own toggle.

## Calibrate

Use this when a screenshot has a border, or when it does not actually cover the whole 16 km frame.

1. Open the map and click **Calibrate**.
2. Click a point you know. Type its real X and Y in meters, or paste a game mark.
3. Click a second point far away, with separation both across and up the image, and enter that position too.
4. The page saves scale and offset for that map in this browser.

A Mark Coordinates paste such as `x100.05, y109.14` uses the game unit from [wardogs-calculator](https://github.com/apollyon-sys/wardogs-calculator) (MIT): 1 unit is 100 meters, so that example is 10,005 m and 10,914 m. A plain pair such as `6500 11500` is already meters. Larger game X is to the right. Larger game Y is toward the top.

**Reset to 16 km** puts the image back on the plain frame. Pins and the mortar stay where you put them in meter coordinates, so calibrate before you rely on old pins.

## Mortar, pins, and measure

**Set Mortar** (or the M key), then click the map. You can also type X/Y or a grid reference and use **Set mortar here**. The mortar is saved per map. Drag the M marker to nudge it.

A ring shows the minimum and maximum range. Defaults are 100 m and 1,500 m. Change them in the sidebar or on **Settings**. The map shades the area you cannot hit: inside the minimum, and outside the maximum.

Clicking the map in **Target** mode drops a pin. Each pin has a name, a color, and a type: Target, Enemy, Objective, Friendly, or Other. Pins are saved per map. Rename and delete from the selected pin, or **Clear all** for that map. The list is sorted by distance from the mortar.

Select a pin (click it, or click its row) and the page draws a line from the mortar and shows:

- Distance in whole meters
- Elevation under the distance, when the range table can interpolate it
- Bearing in degrees, 0 = north, clockwise
- Mils in their own field, 6,400 per circle, or 6,000 if you switch it
- The target's grid reference
- In range or out of range

**Measure** lets you click two or more points. Each leg shows its length and bearing, plus the total. Esc clears the measure line.

Keyboard, when you are not typing in a field: M sets mortar mode, T returns to target mode, Tab cycles pins, Delete removes the selected pin, Esc clears a measure and cancels mortar or calibrate mode.

## Range table

**Settings** has an elevation table of distance in meters and the elevation value. It starts empty. Enter values from the game. The app does not fill in numbers of its own. With two or more rows, a selected target looks up elevation by linear interpolation. Distances outside the rows you entered are marked outside the table.

## Layout

The page is dark, with a large distance readout. On a phone in portrait the panel sits along the bottom. **Compact** hides the sidebar and leaves the map plus the distance and bearing panel, which is the view to keep on a second monitor.

## Deploy on Railway as a static site

1. Push this repo to GitHub (it lives at `codykadoo/wardogs-pin-map`).
2. In [Railway](https://railway.com/), create a project and choose **Deploy from GitHub repo**.
3. Railway's Nixpacks builder runs `npm run build` (see `railway.toml`). The start command serves the `dist` folder:

```bash
npx serve dist -s -l tcp://0.0.0.0:$PORT
```

4. Do not set `NODE_ENV=production` before install, or npm will skip the Vite toolchain that the build needs. Railway's default install includes devDependencies, which is what you want.
5. Open the generated Railway URL. Pins stay in each visitor's browser. There is no server and no account.

You can also build locally with `npm run build` and upload the `dist` folder to any static host. The site is a single-page app, so the host must serve `index.html` for unknown paths (`serve -s` does that).

## License

The 100 m game-unit scale and the north-clockwise bearing follow the coordinate convention documented by apollyon-sys/wardogs-calculator, which is MIT licensed. The license text is in `LICENSES/THIRD_PARTY`. Map images from that project are not included.
