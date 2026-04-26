const numberBoard = document.querySelector("#numberBoard");
const actionButton = document.querySelector("#actionButton");
const timer = document.querySelector("#timer");
const roundCount = document.querySelector("#roundCount");
const historyList = document.querySelector("#historyList");
const answerPreview = document.querySelector("#answerPreview");
const difficultyButtons = document.querySelectorAll(".difficulty-button");

const colors = ["#d34836", "#1663c7", "#0d8b73", "#8d47b8", "#c77800", "#3558d4", "#ce2d76", "#ec6a73"];
const difficulties = {
  warmup: {
    label: "暖身",
    count: 4,
    numberRange: [1, 9],
    sizeRatios: [0.12, 0.28, 0.5, 0.68],
    anchors: [
      { x: 22, y: 24, spread: 9 },
      { x: 77, y: 25, spread: 9 },
      { x: 24, y: 73, spread: 10 },
      { x: 76, y: 72, spread: 10 },
    ],
  },
  focus: {
    label: "专注",
    count: 6,
    numberRange: [10, 99],
    sizeRatios: [0.11, 0.15, 0.21, 0.27, 0.33, 0.39],
    anchors: [
      { x: 20, y: 24, spread: 8 },
      { x: 50, y: 20, spread: 8 },
      { x: 80, y: 24, spread: 8 },
      { x: 24, y: 68, spread: 8 },
      { x: 50, y: 73, spread: 8 },
      { x: 78, y: 67, spread: 8 },
    ],
  },
  lightning: {
    label: "闪电",
    count: 8,
    numberRange: [10, 99],
    sizeRatios: [0.09, 0.11, 0.14, 0.17, 0.2, 0.24, 0.28, 0.33],
    anchors: [
      { x: 18, y: 22, spread: 6 },
      { x: 44, y: 18, spread: 6 },
      { x: 72, y: 22, spread: 6 },
      { x: 84, y: 46, spread: 6 },
      { x: 74, y: 74, spread: 6 },
      { x: 48, y: 79, spread: 6 },
      { x: 21, y: 73, spread: 6 },
      { x: 16, y: 46, spread: 6 },
    ],
  },
};

let startedAt = 0;
let timerId = 0;
let currentNumbers = [];
let rounds = 0;
let history = [];
let roundState = "idle";
let currentDifficultyId = "warmup";

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function getCurrentDifficulty() {
  return difficulties[currentDifficultyId];
}

function createRoundNumbers() {
  const difficulty = getCurrentDifficulty();
  const [min, max] = difficulty.numberRange;
  const pool = [];

  for (let value = min; value <= max; value += 1) {
    pool.push(value);
  }

  return shuffle(pool).slice(0, getCurrentDifficulty().count);
}

function formatSeconds(milliseconds) {
  return `${(milliseconds / 1000).toFixed(2)} 秒`;
}

function updateTimer() {
  timer.textContent = formatSeconds(performance.now() - startedAt);
}

function updatePrompt(text) {
  answerPreview.textContent = text;
}

function syncActionButton() {
  if (roundState === "running") {
    actionButton.textContent = "我读完了";
    actionButton.setAttribute("aria-label", "完成本局并显示答案");
    return;
  }

  if (roundState === "finished") {
    actionButton.textContent = "开始下一局";
    actionButton.setAttribute("aria-label", "开始下一局");
    return;
  }

  actionButton.textContent = "开始第一局";
  actionButton.setAttribute("aria-label", "开始第一局");
}

function syncDifficultyButtons() {
  difficultyButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.level === currentDifficultyId);
  });
}

function getIdlePrompt() {
  const difficulty = getCurrentDifficulty();
  const numberHint = difficulty.numberRange[0] >= 10 ? "两位数" : "个位数";
  return `当前是${difficulty.label}局，共${difficulty.count}个${numberHint}，完成后显示答案`;
}

function getAnswer(numbers) {
  return [...numbers].sort((a, b) => b - a).join("、");
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getPosition(anchor, fontSize) {
  const board = numberBoard.getBoundingClientRect();
  const xMargin = Math.min(46, Math.max(8, (fontSize * 0.38 * 100) / board.width));
  const yMargin = Math.min(44, Math.max(10, (fontSize * 0.48 * 100) / board.height));

  return {
    x: clamp(randomBetween(anchor.x - anchor.spread, anchor.x + anchor.spread), xMargin, 100 - xMargin),
    y: clamp(randomBetween(anchor.y - anchor.spread, anchor.y + anchor.spread), yMargin, 100 - yMargin),
  };
}

function getBounds(position, fontSize) {
  const board = numberBoard.getBoundingClientRect();
  const sampleText = getCurrentDifficulty().numberRange[0] >= 10 ? "88" : "8";
  const width = fontSize * (sampleText.length >= 2 ? 1.18 : 0.68);
  const height = fontSize * 0.92;
  const centerX = (position.x / 100) * board.width;
  const centerY = (position.y / 100) * board.height;

  return {
    left: centerX - width / 2,
    right: centerX + width / 2,
    top: centerY - height / 2,
    bottom: centerY + height / 2,
  };
}

function overlaps(a, b, count) {
  const gap = count >= 8 ? 10 : count >= 6 ? 14 : 20;
  return !(
    a.right + gap < b.left ||
    a.left - gap > b.right ||
    a.bottom + gap < b.top ||
    a.top - gap > b.bottom
  );
}

function createSizes() {
  const board = numberBoard.getBoundingClientRect();
  const difficulty = getCurrentDifficulty();
  const base = Math.min(board.width, board.height);
  const usesDoubleDigits = difficulty.numberRange[0] >= 10;
  const maxSize = difficulty.count >= 8 ? 190 : difficulty.count >= 6 ? 240 : 300;
  const minSize = difficulty.count >= 8 ? 30 : 36;
  const widthScale = usesDoubleDigits ? 0.82 : 1;

  return difficulty.sizeRatios.map((ratio) =>
    Math.round(clamp(base * ratio * widthScale, minSize, usesDoubleDigits ? maxSize * 0.86 : maxSize)),
  );
}

function createPlacements(sizeList) {
  const difficulty = getCurrentDifficulty();
  const anchors = shuffle(difficulty.anchors);
  const sorted = sizeList
    .map((fontSize, index) => ({ fontSize, index }))
    .sort((a, b) => b.fontSize - a.fontSize);
  const placements = [];

  sorted.forEach((item, sortedIndex) => {
    const anchor = anchors[sortedIndex];
    let position = getPosition(anchor, item.fontSize);
    let bounds = getBounds(position, item.fontSize);

    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (!placements.some((placed) => overlaps(bounds, placed.bounds, difficulty.count))) break;
      position = getPosition(anchor, item.fontSize);
      bounds = getBounds(position, item.fontSize);
    }

    placements[item.index] = { position, bounds };
  });

  return placements;
}

function renderNumbers(numbers) {
  const mixedSizes = shuffle(createSizes());
  const mixedColors = shuffle(colors).slice(0, numbers.length);
  const placements = createPlacements(mixedSizes);

  numberBoard.replaceChildren(
    ...numbers.map((value, index) => {
      const number = document.createElement("span");
      const position = placements[index].position;

      number.className = "number";
      number.textContent = value;
      number.style.color = mixedColors[index];
      number.style.fontSize = `${mixedSizes[index]}px`;
      number.style.left = `${position.x}%`;
      number.style.top = `${position.y}%`;

      return number;
    }),
  );
}

function startRound() {
  window.clearInterval(timerId);
  currentNumbers = createRoundNumbers();
  startedAt = performance.now();
  roundState = "running";
  timer.textContent = "0.00 秒";
  updatePrompt("先读完这一局，再点按钮看答案");
  syncActionButton();
  renderNumbers(currentNumbers);
  timerId = window.setInterval(updateTimer, 30);
}

function finishRound() {
  if (roundState !== "running") return;

  const elapsed = performance.now() - startedAt;
  window.clearInterval(timerId);
  roundState = "finished";
  timer.textContent = formatSeconds(elapsed);
  syncActionButton();
  rounds += 1;
  roundCount.textContent = rounds;

  const difficulty = getCurrentDifficulty();
  const answer = getAnswer(currentNumbers);
  updatePrompt(`正确顺序：${answer}`);
  history = [{ time: formatSeconds(elapsed), answer, level: difficulty.label }, ...history].slice(0, 5);
  renderHistory();
}

function renderHistory() {
  historyList.replaceChildren(
    ...history.map((item) => {
      const record = document.createElement("li");
      const detail = document.createElement("span");
      record.textContent = `${item.level} · ${item.time}`;
      detail.textContent = `顺序：${item.answer}`;
      record.append(detail);
      return record;
    }),
  );
}

function setDifficulty(level) {
  if (!difficulties[level] || currentDifficultyId === level) return;

  currentDifficultyId = level;
  window.clearInterval(timerId);
  roundState = "idle";
  timer.textContent = "0.00 秒";
  currentNumbers = [];
  numberBoard.replaceChildren();
  syncDifficultyButtons();
  syncActionButton();
  updatePrompt(getIdlePrompt());
}

function handleAction() {
  if (roundState === "running") {
    finishRound();
    return;
  }

  startRound();
}

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setDifficulty(button.dataset.level);
  });
});

actionButton.addEventListener("click", handleAction);
syncDifficultyButtons();
syncActionButton();
updatePrompt(getIdlePrompt());
