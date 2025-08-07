# Idle Tribal Game

Idle Tribal Game is a simplified idle strategy game inspired by classic titles like **Tribal Wars**, **Kingshot** and **Clash of Clans**.  In Tribal Wars players start with a small village and gradually expand by constructing buildings, recruiting units and conquering new villages【955918093132431†L192-L200】.  Clash of Clans refines this formula with a polished core loop built around **collecting resources**, **building & training** and **battling**【521200255890287†L90-L122】.  Kingshot takes these ideas into an idle survival setting and adds mechanics such as defending against invasions, managing workers and establishing laws【385794094328824†L139-L186】.

This project aims to capture the feel of these games in a small idle experience playable on mobile and desktop browsers.  Players construct and upgrade resource‑producing buildings, watch their resources accumulate over time and plan their next expansion.  The code is deliberately kept simple and extensible so multiplayer elements or additional buildings can be added later.

## Features

* **Resource generation** – Woodcutters, quarries and farms automatically produce wood, stone and food.  Higher level buildings produce more per second.
* **Construction & upgrades** – Buildings have an escalating cost and construction time.  Only one construction job may run at once, mirroring the time‑management of classic strategy games.
* **Persistent progress** – All game data (resources, buildings and construction queue) are saved to the browser’s `localStorage`.  Closing the tab and returning later continues from where you left off.
* **Mobile‑friendly UI** – The responsive layout and clean design make the game comfortable to play on phones, tablets and desktops.  Icons are original cartoon art generated for wood, stone and bread resources.
* **Extensible** – The architecture separates definitions (rates, costs, time multipliers) from logic.  Additional building types or new mechanics (research, troops, combat) can be added easily.

* **Troops & raids** – A **Barracks** building can be constructed to improve training speed.  Players spend resources to train troops and then send them on raids for a chance to earn bonus resources.  Raids consume a fixed number of troops and return random amounts of wood, stone and food after a time delay.

## Getting Started

This repository contains a simple static site.  To run the game locally, clone the repo and open `index.html` in a browser.  For development you can start a local server (for example with Python’s `http.server`):

```sh
git clone <your‑fork‑url>
cd idle_game
python3 -m http.server 8000
# then visit http://localhost:8000/index.html
```

Deployment on [Vercel](https://vercel.com/) or any static hosting provider is straightforward because there is no server‑side code.  Simply point the deployment at the `idle_game` directory.  A basic `vercel.json` file is included to configure clean URLs.

## Repository Structure

```
idle_game/
├── index.html       # Main HTML file with game container
├── styles.css       # Modern UI styling
├── script.js        # Game logic (state management, rendering, production loop)
├── assets/          # Resource icons (wood, stone, food)
├── vercel.json      # Optional deployment configuration for Vercel
└── README.md        # This documentation
```

## Future Improvements

The current version is intentionally simple.  Potential enhancements include:

* **More buildings** – add defensive structures (watchtowers) or technology buildings that boost production.
* **Multiplayer** – introduce asynchronous battles or trading between players, taking inspiration from the combat system where players attack villages in real time and conquer them【955918093132431†L192-L200】.
* **Tasks & achievements** – provide short‑term goals to guide new players, similar to the single‑player missions in Clash of Clans【521200255890287†L197-L205】.
* **Graphics & audio** – integrate richer artwork and simple sound effects.
* **Cloud save** – allow players to log in and sync progress across devices.

Contributions are welcome!  Feel free to fork the project and suggest new mechanics or improvements via pull requests.