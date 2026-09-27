# Wardogs Pin Map

A Google-Maps-style helper for the PC game WARDOGS. Drop a pin where you are and a pin on the objective. The page shows compass bearing, distance in meters, and the 1 km grid squares between them.

It does **not** touch the game. No memory reading, no file reading, no packet capture, no screen reading, no injection. You type or paste your position yourself.

## Run on your PC

Works on Windows, macOS, and Linux. You need [Node.js 22](https://nodejs.org/) (the Current or latest LTS is fine).

```bat
git clone https://github.com/codykadoo/wardogs-pin-map.git
cd wardogs-pin-map
npm install
npm run dev
```

Vite prints a local address, usually `http://localhost:5173`. Open that in a browser. On a second monitor, use **Compact** for a narrow bearing-and-distance window you can keep beside the game.

`npm test` checks the coordinate math.

## Your map screenshots

The pictures in `public/maps/` are placeholders, not in-game maps. Replace them with your own screenshots of the tactical map:

| Map | File |
| --- | --- |
| Bakurani | `public/maps/bakurani.png` |
| Ozeti | `public/maps/ozeti.png` |
| Zestafona | `public/maps/zestafona.png` |

Do not download, hotlink, or copy map images or tiles from other sites (including wardogs-artillery.com, MetaForge, or MetaBot). After you drop a screenshot in, restart `npm run dev` if the old image is cached, then open **Calibrate**.

## Calibration

Each map can use any screenshot size.

1. Click **Calibrate**.
2. Click a point you know and type its game X and Y (from Mark Coordinates, the M key).
3. Click a second point far away, diagonally if you can, and type that X and Y.
4. The page saves scale and offset for that map in this browser.

Until you calibrate, the image is stretched across the full tactical sheet used by the reference calculator (about X -0.03 to 163.81 and Y -0.01 to 163.83). North is up. A larger game X is to the right. A larger game Y is toward the top.

## Coordinates

Adapted from [wardogs-calculator](https://github.com/apollyon-sys/wardogs-calculator) (MIT). See `LICENSES/THIRD_PARTY`. One coordinate unit is 100 meters, so `0.01` is 1 meter. Compass bearing is `atan2(east, north)`, 0° = north, clockwise.

The paste box accepts:

- A Mark Coordinates paste, for example `x100.05, y109.14`
- Two numbers, typed in the paste box or in the X and Y fields
- A grid reference like `7-10` (column-row). That drops the pin in the center of the square.

Very large pairs such as `8364 7285` are treated as raw meters and divided by 100.

Each map is a 16 × 16 km sheet. Columns 1–16 run left to right and rows 1–16 run bottom to top, starting at coordinate 0. Square `7-10` covers X 60–70 and Y 90–100. Toggle the 1 km grid, and the 100 m grid when you are zoomed in. Click the map to drop the active pin (Me, Objective, Base, waypoint, or a named pin). Drag a pin to nudge it.

The big number is the straight line from Me to the objective: degrees, compass point, meters, and the squares crossed. Waypoints bend the route and list each leg. Routes you name are saved per map in `localStorage`.

## Deploy on Railway as a static site

1. Push this repo to GitHub (it already lives at `codykadoo/wardogs-pin-map` if you cloned it).
2. In [Railway](https://railway.com/), create a project and choose **Deploy from GitHub repo**.
3. Railway's Nixpacks builder runs `npm run build` (see `railway.toml`). The start command serves the `dist` folder:

```bash
npx serve dist -s -l tcp://0.0.0.0:$PORT
```

4. Do not set `NODE_ENV=production` before install, or npm will skip the Vite toolchain that the build needs. Railway's default install includes devDependencies, which is what you want.
5. Open the generated Railway URL. Pins stay in each visitor's browser. There is no server and no account.

You can also build locally with `npm run build` and upload the `dist` folder to any static host. The site is a single-page app, so the host must serve `index.html` for unknown paths (`serve -s` does that).

## License

Coordinate math is adapted from apollyon-sys/wardogs-calculator under the MIT license reproduced in `LICENSES/THIRD_PARTY`. Map images from that project are not included.
