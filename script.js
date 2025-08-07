/*
  Main game logic for the Idle Tribal Game.

  This script defines the core state management, resource generation and user
  interface rendering. Game state is stored in localStorage so that progress
  persists across sessions. A single construction queue is used to enforce
  sequential building and upgrading. All times are measured in milliseconds
  using Date.now().

  Author: OpenAI ChatGPT
*/

(() => {
  /**
   * Base definitions for each building type. Each building produces one
   * resource and has a base cost/time associated with construction. Upgrade
   * costs and times scale with the level using a multiplier.
   */
  const BUILDING_TYPES = {
    woodcutter: {
      key: 'woodcutter',
      name: 'Woodcutter',
      resource: 'wood',
      baseRate: 1, // per second
      baseCost: { wood: 0, stone: 20, food: 10 },
      baseTime: 5, // seconds
    },
    quarry: {
      key: 'quarry',
      name: 'Quarry',
      resource: 'stone',
      baseRate: 0.8,
      baseCost: { wood: 20, stone: 0, food: 10 },
      baseTime: 5,
    },
    farm: {
      key: 'farm',
      name: 'Farm',
      resource: 'food',
      baseRate: 0.5,
      baseCost: { wood: 20, stone: 10, food: 0 },
      baseTime: 5,
    },

    // Barracks allow training troops. They do not directly produce
    // resources per second, but higher levels decrease troop training
    // time. Inspired by troop training mechanics in Clash of Clans and
    // Kingshot【521200255890287†L90-L122】【385794094328824†L139-L186】.
    barracks: {
      key: 'barracks',
      name: 'Barracks',
      resource: null, // does not generate resources passively
      baseRate: 0,
      baseCost: { wood: 100, stone: 50, food: 50 },
      baseTime: 8,
    },
  };

  const COST_MULTIPLIER = 1.5;
  const TIME_MULTIPLIER = 1.6;

  // Constants for troop training and raids. These values determine the cost
  // and duration for training a single troop and sending raids. Raid rewards
  // are randomized within the specified ranges.
  const TRAIN_COST = { wood: 15, stone: 15, food: 10 };
  const BASE_TRAIN_TIME = 5000; // 5 seconds in milliseconds
  const RAID_COST_TROOPS = 5;
  const RAID_TIME = 30000; // 30 seconds
  const RAID_REWARD_RANGES = {
    wood: [20, 40],
    stone: [20, 40],
    food: [10, 30],
  };

  /**
   * Default initial game state.
   */
  const DEFAULT_STATE = {
    resources: {
      wood: 50,
      stone: 50,
      food: 50,
    },
    buildings: [], // { type: 'woodcutter', level: 1 }
    queue: null, // { type, targetIndex, level, startTime, endTime }
    troops: 0, // number of trained troops available
    trainingQueue: null, // { startTime, endTime }
    raidQueue: null, // { startTime, endTime, reward }
    lastUpdate: Date.now(),
  };

  let state;

  /**
   * Persist the current state to localStorage.
   */
  function saveState() {
    localStorage.setItem('idleTribalState', JSON.stringify(state));
  }

  /**
   * Load the state from localStorage or fall back to defaults.
   */
  function loadState() {
    const data = localStorage.getItem('idleTribalState');
    if (data) {
      try {
        state = JSON.parse(data);
      } catch {
        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      }
    } else {
      state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
    // Ensure lastUpdate exists
    if (!state.lastUpdate) state.lastUpdate = Date.now();

    // Ensure new properties exist for backward compatibility
    if (state.troops === undefined) state.troops = 0;
    if (state.trainingQueue === undefined) state.trainingQueue = null;
    if (state.raidQueue === undefined) state.raidQueue = null;
  }

  /**
   * Calculate the production per second for a building based on its level.
   * @param {Object} building
   * @returns {number}
   */
  function getProduction(building) {
    const def = BUILDING_TYPES[building.type];
    return def.baseRate * building.level;
  }

  /**
   * Calculate the cost for constructing or upgrading a building at a given
   * level. For level 1 (new building), we use the base cost. For higher
   * levels, we multiply the base cost by COST_MULTIPLIER^(level - 1).
   * @param {string} type
   * @param {number} level
   */
  function calculateCost(type, level) {
    const def = BUILDING_TYPES[type];
    const multiplier = Math.pow(COST_MULTIPLIER, level - 1);
    const cost = {};
    Object.keys(def.baseCost).forEach((res) => {
      cost[res] = Math.ceil(def.baseCost[res] * multiplier);
    });
    return cost;
  }

  /**
   * Calculate construction or upgrade time in milliseconds for a given level.
   * @param {string} type
   * @param {number} level
   */
  function calculateTime(type, level) {
    const def = BUILDING_TYPES[type];
    const seconds = def.baseTime * Math.pow(TIME_MULTIPLIER, level - 1);
    return Math.ceil(seconds * 1000);
  }

  /**
   * Add resources based on building production and elapsed time.
   */
  function updateResources() {
    const now = Date.now();
    const deltaSeconds = (now - state.lastUpdate) / 1000;
    if (deltaSeconds <= 0) return;
    state.buildings.forEach((building) => {
      const def = BUILDING_TYPES[building.type];
      // Skip buildings that do not generate resources
      if (!def.resource || def.baseRate <= 0) return;
      const amount = def.baseRate * building.level * deltaSeconds;
      state.resources[def.resource] += amount;
    });
    state.lastUpdate = now;
    saveState();
  }

  /**
   * Check the construction queue and complete the job if finished.
   */
  function checkQueue() {
    if (!state.queue) return;
    const now = Date.now();
    if (now >= state.queue.endTime) {
      const { type, targetIndex, level } = state.queue;
      if (targetIndex === null) {
        // new building
        state.buildings.push({ type, level });
      } else {
        // upgrade existing
        state.buildings[targetIndex].level = level;
      }
      state.queue = null;
      saveState();
    }
  }

  /**
   * Attempt to start constructing a new building. If resources are insufficient
   * or a job is already queued, the function does nothing. Otherwise it
   * deducts resources and sets the queue.
   * @param {string} type
   */
  function buildNew(type) {
    if (state.queue) return;
    const cost = calculateCost(type, 1);
    if (!hasResources(cost)) return;
    // Deduct resources
    deductResources(cost);
    const duration = calculateTime(type, 1);
    state.queue = {
      type,
      targetIndex: null,
      level: 1,
      startTime: Date.now(),
      endTime: Date.now() + duration,
    };
    saveState();
    renderQueue();
    renderConstructionOptions();
    renderResources();
  }

  /**
   * Attempt to upgrade an existing building at a given index. Checks for
   * resources and queue availability.
   * @param {number} index
   */
  function upgradeBuilding(index) {
    if (state.queue) return;
    const building = state.buildings[index];
    const nextLevel = building.level + 1;
    const cost = calculateCost(building.type, nextLevel);
    if (!hasResources(cost)) return;
    // Deduct resources
    deductResources(cost);
    const duration = calculateTime(building.type, nextLevel);
    state.queue = {
      type: building.type,
      targetIndex: index,
      level: nextLevel,
      startTime: Date.now(),
      endTime: Date.now() + duration,
    };
    saveState();
    renderQueue();
    renderBuildings();
    renderResources();
  }

  /**
   * Check if the player has enough resources to afford a cost object.
   * @param {Object} cost
   */
  function hasResources(cost) {
    return Object.keys(cost).every((res) => state.resources[res] >= cost[res]);
  }

  /**
   * Deduct a cost object from the player's resources.
   * @param {Object} cost
   */
  function deductResources(cost) {
    Object.keys(cost).forEach((res) => {
      state.resources[res] -= cost[res];
    });
  }

  /**
   * Format a number to display with up to one decimal place.
   * @param {number} num
   */
  function formatNumber(num) {
    return num < 100 ? num.toFixed(1) : Math.floor(num);
  }

  /**
   * Render the resource bar at the top of the UI.
   */
  function renderResources() {
    const bar = document.getElementById('resource-bar');
    bar.innerHTML = '';
    const resources = [
      { key: 'wood', img: 'assets/wood.png' },
      { key: 'stone', img: 'assets/stone.png' },
      { key: 'food', img: 'assets/food.png' },
    ];
    const VERSION = '1';
    resources.forEach(({ key, img }) => {
      const div = document.createElement('div');
      div.className = 'resource-item';
      const image = document.createElement('img');
      // Append version query to prevent stale browser caching
      image.src = `${img}?v=${VERSION}`;
      image.alt = key;
      const span = document.createElement('span');
      span.textContent = `${formatNumber(state.resources[key])}`;
      div.appendChild(image);
      div.appendChild(span);
      bar.appendChild(div);
    });
  }

  /**
   * Render the list of existing buildings with their production and upgrade
   * buttons.
   */
  function renderBuildings() {
    const list = document.getElementById('buildings-list');
    list.innerHTML = '';
    if (state.buildings.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'No buildings yet. Construct one below to start producing resources!';
      list.appendChild(p);
      return;
    }
    state.buildings.forEach((building, index) => {
      const card = document.createElement('div');
      card.className = 'building-card';
      const info = document.createElement('div');
      info.className = 'building-info';
      const title = document.createElement('strong');
      title.textContent = `${BUILDING_TYPES[building.type].name} (Lv ${building.level})`;
      // Description: show production or training effect
      const desc = document.createElement('span');
      const def = BUILDING_TYPES[building.type];
      if (def.resource && def.baseRate > 0) {
        desc.textContent = `Produces ${def.resource}: ${getProduction(building).toFixed(1)}/s`;
      } else {
        desc.textContent = `Improves troop training speed`;
      }
      info.appendChild(title);
      info.appendChild(desc);
      // Cost for next level
      const nextLevel = building.level + 1;
      const costObj = calculateCost(building.type, nextLevel);
      const costStr = Object.entries(costObj)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ');
      const timeStr = (calculateTime(building.type, nextLevel) / 1000).toFixed(0);
      const cost = document.createElement('span');
      cost.textContent = `Upgrade cost: ${costStr} (Time: ${timeStr}s)`;
      cost.style.fontSize = '0.8rem';
      info.appendChild(cost);
      card.appendChild(info);
      const actions = document.createElement('div');
      actions.className = 'building-actions';
      const btn = document.createElement('button');
      btn.textContent = 'Upgrade';
      btn.disabled = !!state.queue || !hasResources(costObj);
      btn.onclick = () => upgradeBuilding(index);
      actions.appendChild(btn);
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  /**
   * Render the available construction options for new buildings.
   */
  function renderConstructionOptions() {
    const container = document.getElementById('construction-options');
    container.innerHTML = '';
    Object.keys(BUILDING_TYPES).forEach((type) => {
      const def = BUILDING_TYPES[type];
      const card = document.createElement('div');
      card.className = 'construction-card';
      const info = document.createElement('div');
      info.className = 'building-info';
      const title = document.createElement('strong');
      title.textContent = def.name;
      const desc = document.createElement('span');
      if (def.resource && def.baseRate > 0) {
        desc.textContent = `Produces ${def.resource}: ${def.baseRate.toFixed(1)}/s`;
      } else {
        desc.textContent = `Improves troop training speed`;
      }
      info.appendChild(title);
      info.appendChild(desc);
      // cost and time for level 1
      const costObj = calculateCost(type, 1);
      const costStr = Object.entries(costObj)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ');
      const timeStr = (calculateTime(type, 1) / 1000).toFixed(0);
      const cost = document.createElement('span');
      cost.textContent = `Cost: ${costStr} (Time: ${timeStr}s)`;
      cost.style.fontSize = '0.8rem';
      info.appendChild(cost);
      card.appendChild(info);
      const btn = document.createElement('button');
      btn.textContent = 'Build';
      btn.disabled = !!state.queue || !hasResources(costObj);
      btn.onclick = () => buildNew(type);
      card.appendChild(btn);
      container.appendChild(card);
    });
  }

  /**
   * Render the construction queue progress bar.
   */
  function renderQueue() {
    const container = document.getElementById('queue-container');
    container.innerHTML = '';
    if (!state.queue) return;
    const { type, targetIndex, level, startTime, endTime } = state.queue;
    const def = BUILDING_TYPES[type];
    const action = targetIndex === null ? 'Constructing' : 'Upgrading';
    const card = document.createElement('div');
    card.className = 'construction-card';
    const info = document.createElement('div');
    info.className = 'building-info';
    const title = document.createElement('strong');
    title.textContent = `${action} ${def.name} to Lv ${level}`;
    info.appendChild(title);
    // progress bar
    const progress = document.createElement('div');
    progress.className = 'progress-bar';
    const bar = document.createElement('div');
    progress.appendChild(bar);
    const updateProgress = () => {
      const now = Date.now();
      const total = endTime - startTime;
      const elapsed = Math.min(now - startTime, total);
      const ratio = Math.max(0, Math.min(1, elapsed / total));
      bar.style.width = `${ratio * 100}%`;
      if (ratio >= 1) {
        clearInterval(interval);
      }
    };
    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    info.appendChild(progress);
    card.appendChild(info);
    container.appendChild(card);
  }

  /**
   * Calculate the total level of all barracks buildings. Higher levels
   * reduce troop training time.
   */
  function getTotalBarracksLevel() {
    return state.buildings
      .filter((b) => b.type === 'barracks')
      .reduce((sum, b) => sum + b.level, 0);
  }

  /**
   * Compute the training duration in milliseconds, factoring in the total
   * level of barracks. Each level increases the training speed by 50%.
   * We ensure a minimum duration of 1 second.
   */
  function calculateTrainingDuration() {
    const total = getTotalBarracksLevel();
    const multiplier = 1 + 0.5 * total;
    return Math.max(1000, BASE_TRAIN_TIME / multiplier);
  }

  /**
   * Start training a single troop. Requires sufficient resources and an
   * available training queue.
   */
  function trainTroop() {
    if (state.trainingQueue) return;
    if (!hasResources(TRAIN_COST)) return;
    deductResources(TRAIN_COST);
    const duration = calculateTrainingDuration();
    state.trainingQueue = {
      startTime: Date.now(),
      endTime: Date.now() + duration,
    };
    saveState();
    renderResources();
    renderTroops();
    renderTraining();
  }

  /**
   * Check if the troop training queue has finished. If complete, add the
   * troop to the player's total and clear the queue.
   */
  function checkTrainingQueue() {
    if (!state.trainingQueue) return;
    const now = Date.now();
    if (now >= state.trainingQueue.endTime) {
      state.troops += 1;
      state.trainingQueue = null;
      saveState();
      renderResources();
      renderTroops();
      renderTraining();
    }
  }

  /**
   * Send a raid using a specified number of troops. The raid consumes
   * troops, lasts a fixed duration and rewards random resources upon
   * completion. If a raid is already in progress or insufficient troops
   * are available, nothing happens.
   */
  function raid() {
    if (state.raidQueue) return;
    if (state.troops < RAID_COST_TROOPS) return;
    state.troops -= RAID_COST_TROOPS;
    // Generate random reward within the defined ranges
    const reward = {};
    Object.keys(RAID_REWARD_RANGES).forEach((res) => {
      const [min, max] = RAID_REWARD_RANGES[res];
      reward[res] = Math.floor(min + Math.random() * (max - min + 1));
    });
    state.raidQueue = {
      startTime: Date.now(),
      endTime: Date.now() + RAID_TIME,
      reward,
    };
    saveState();
    renderResources();
    renderTroops();
    renderRaid();
  }

  /**
   * Check if the raid has completed. On completion, distribute the
   * accumulated reward to the player's resources and clear the queue.
   */
  function checkRaidQueue() {
    if (!state.raidQueue) return;
    const now = Date.now();
    if (now >= state.raidQueue.endTime) {
      Object.keys(state.raidQueue.reward).forEach((res) => {
        state.resources[res] += state.raidQueue.reward[res];
      });
      state.raidQueue = null;
      saveState();
      renderResources();
      renderTroops();
      renderRaid();
    }
  }

  /**
   * Render the troops information card and training button.
   */
  function renderTroops() {
    const infoContainer = document.getElementById('troops-info');
    if (!infoContainer) return;
    infoContainer.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'troop-card';
    const info = document.createElement('div');
    info.className = 'troop-info';
    const title = document.createElement('strong');
    title.textContent = `Troops: ${state.troops}`;
    info.appendChild(title);
    // Cost and time for training
    const trainDurationSec = Math.round(calculateTrainingDuration() / 1000);
    const costStr = Object.entries(TRAIN_COST)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ');
    const costSpan = document.createElement('span');
    costSpan.textContent = `Train cost: ${costStr} (Time: ${trainDurationSec}s)`;
    costSpan.style.fontSize = '0.8rem';
    info.appendChild(costSpan);
    card.appendChild(info);
    const actions = document.createElement('div');
    actions.className = 'troop-actions';
    const btn = document.createElement('button');
    btn.textContent = 'Train Troop';
    btn.disabled = !!state.trainingQueue || !hasResources(TRAIN_COST);
    btn.onclick = () => trainTroop();
    actions.appendChild(btn);
    card.appendChild(actions);
    infoContainer.appendChild(card);
  }

  /**
   * Render the training queue progress bar.
   */
  function renderTraining() {
    const container = document.getElementById('training-container');
    if (!container) return;
    container.innerHTML = '';
    if (!state.trainingQueue) return;
    const card = document.createElement('div');
    card.className = 'troop-card';
    const info = document.createElement('div');
    info.className = 'troop-info';
    const title = document.createElement('strong');
    title.textContent = `Training Troop`;
    info.appendChild(title);
    // progress bar
    const progress = document.createElement('div');
    progress.className = 'progress-bar';
    const bar = document.createElement('div');
    progress.appendChild(bar);
    const { startTime, endTime } = state.trainingQueue;
    const updateProgress = () => {
      const now = Date.now();
      const total = endTime - startTime;
      const elapsed = Math.min(now - startTime, total);
      const ratio = Math.max(0, Math.min(1, elapsed / total));
      bar.style.width = `${ratio * 100}%`;
      if (ratio >= 1) {
        clearInterval(interval);
      }
    };
    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    info.appendChild(progress);
    card.appendChild(info);
    container.appendChild(card);
  }

  /**
   * Render the raid queue progress bar and start raid button.
   */
  function renderRaid() {
    const container = document.getElementById('raid-container');
    if (!container) return;
    container.innerHTML = '';
    // Raid in progress
    if (state.raidQueue) {
      const { startTime, endTime, reward } = state.raidQueue;
      const card = document.createElement('div');
      card.className = 'raid-card';
      const info = document.createElement('div');
      info.className = 'troop-info';
      const title = document.createElement('strong');
      title.textContent = `Raid in progress`;
      info.appendChild(title);
      // progress bar
      const progress = document.createElement('div');
      progress.className = 'progress-bar';
      const bar = document.createElement('div');
      progress.appendChild(bar);
      const updateProgress = () => {
        const now = Date.now();
        const total = endTime - startTime;
        const elapsed = Math.min(now - startTime, total);
        const ratio = Math.max(0, Math.min(1, elapsed / total));
        bar.style.width = `${ratio * 100}%`;
        if (ratio >= 1) {
          clearInterval(interval);
        }
      };
      updateProgress();
      const interval = setInterval(updateProgress, 1000);
      info.appendChild(progress);
      // show upcoming reward summary
      const rewardStr = Object.entries(reward)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ');
      const rewardSpan = document.createElement('span');
      rewardSpan.textContent = `Reward: ${rewardStr}`;
      rewardSpan.style.fontSize = '0.8rem';
      info.appendChild(rewardSpan);
      card.appendChild(info);
      container.appendChild(card);
      return;
    }
    // No raid; show action card
    const card = document.createElement('div');
    card.className = 'raid-card';
    const info = document.createElement('div');
    info.className = 'troop-info';
    const title = document.createElement('strong');
    title.textContent = 'Send Raid';
    info.appendChild(title);
    // show cost/time/required troops
    const costSpan = document.createElement('span');
    const rewardMin = Object.fromEntries(
      Object.keys(RAID_REWARD_RANGES).map((k) => [k, RAID_REWARD_RANGES[k][0]])
    );
    const rewardMax = Object.fromEntries(
      Object.keys(RAID_REWARD_RANGES).map((k) => [k, RAID_REWARD_RANGES[k][1]])
    );
    const rewardStr = Object.keys(rewardMin)
      .map((k) => `${rewardMin[k]}-${rewardMax[k]} ${k}`)
      .join(', ');
    costSpan.textContent = `Cost: ${RAID_COST_TROOPS} troops (Time: ${RAID_TIME / 1000}s, Reward: ${rewardStr})`;
    costSpan.style.fontSize = '0.8rem';
    info.appendChild(costSpan);
    card.appendChild(info);
    const actions = document.createElement('div');
    actions.className = 'raid-actions';
    const btn = document.createElement('button');
    btn.textContent = 'Raid';
    btn.disabled = state.troops < RAID_COST_TROOPS || !!state.raidQueue;
    btn.onclick = () => raid();
    actions.appendChild(btn);
    card.appendChild(actions);
    container.appendChild(card);
  }

  /**
   * Main update loop: update resources, check queue, then update UI.
   */
  function tick() {
    updateResources();
    checkQueue();
    checkTrainingQueue();
    checkRaidQueue();
    renderResources();
    renderBuildings();
    renderConstructionOptions();
    renderQueue();
    renderTroops();
    renderTraining();
    renderRaid();
  }

  // Initialize the game when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    loadState();
    // Calculate offline progress
    updateResources();
    renderResources();
    renderBuildings();
    renderConstructionOptions();
    renderQueue();
    renderTroops();
    renderTraining();
    renderRaid();
    // Start the interval loop
    setInterval(tick, 1000);
  });
})();