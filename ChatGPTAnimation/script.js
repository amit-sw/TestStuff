const PROMPT = "What is the capital of France";

const CYCLE_WORDS = [
  ["Paris", "London", "Berlin", "The", "A", "France"],
  ["It", "An", "A", "This", "A", "France"],
  ["city", "country", "Europe", "capital", "The", "France"],
];

const ROUND_ONE_TOKENS = ["The", "A", "France"];
const ROUND_ONE_BARS = [92, 62, 40];

const ROUND_TWO_CYCLE = [
  ["capital", "city", "nation", "capital", "capital"],
  ["city", "world", "state", "city", "world"],
  ["world", "country", "place", "world", "world"],
];
const ROUND_TWO_TOKENS = ["capital", "city", "world"];
const ROUND_TWO_BARS = [90, 64, 38];

const ROUND_THREE_CYCLE = [
  ["of", "city", "Rome", "of", "of"],
  ["city", "Rome", "nation", "city", "Rome"],
  ["Rome", "Paris", "Berlin", "Rome", "Rome"],
];
const ROUND_THREE_TOKENS = ["of", "city", "Rome"];
const ROUND_THREE_BARS = [88, 58, 34];

const ROUND_FOUR_CYCLE = [
  ["France", "England", "computers", "France", "France"],
  ["England", "France", "world", "England", "England"],
  ["computers", "code", "machines", "computers", "computers"],
];
const ROUND_FOUR_TOKENS = ["France", "England", "computers"];
const ROUND_FOUR_BARS = [91, 60, 31];

const ROUND_FIVE_CYCLE = [
  ["is", "was", "can", "is", "is"],
  ["was", "is", "could", "was", "was"],
  ["can", "will", "may", "can", "can"],
];
const ROUND_FIVE_TOKENS = ["is", "was", "can"];
const ROUND_FIVE_BARS = [89, 57, 36];

const ROUND_SIX_CYCLE = [
  ["Paris", "not", "world", "Paris", "Paris"],
  ["not", "Paris", "never", "not", "not"],
  ["world", "city", "planet", "world", "world"],
];
const ROUND_SIX_TOKENS = ["Paris", "not", "world"];
const ROUND_SIX_BARS = [93, 41, 30];

const ROUND_SEVEN_CYCLE = [
  [".", ",", " ", ".", "."],
  [",", ".", ";", ",", ","],
  [" ", ".", "!", " ", " "],
];
const ROUND_SEVEN_TOKENS = [".", ",", " "];
const ROUND_SEVEN_BARS = [87, 44, 25];

const ROUND_EIGHT_CYCLE = [
  ["<EOS>", " but", " and", "<EOS>", "<EOS>"],
  [" but", " and", "<EOS>", " but", " but"],
  [" and", " but", ",", " and", " and"],
];
const ROUND_EIGHT_TOKENS = ["<EOS>", " but", " and"];
const ROUND_EIGHT_BARS = [94, 27, 23];

const TIMING = {
  typingMs: 55,
  postEnterPauseMs: 400,
  cycleTickMs: 110,
  cycleTicks: 18,
  settleStaggerMs: 240,
  selectTransferMs: 1200,
  betweenRoundsMs: 520,
};

const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");

const chatThread = document.getElementById("chatThread");
const chatInput = document.getElementById("chatInput");
const tableWrap = document.querySelector(".table-wrap");

const tokenEls = [
  document.getElementById("token0"),
  document.getElementById("token1"),
  document.getElementById("token2"),
];

const barEls = [
  document.getElementById("bar0"),
  document.getElementById("bar1"),
  document.getElementById("bar2"),
];

const state = {
  running: false,
  paused: false,
  finished: false,
  timeoutId: null,
  stepIndex: 0,
  answerText: "",
};

const steps = [
  { duration: 0, action: initTyping },
  ...PROMPT.split("").map((char) => ({ duration: TIMING.typingMs, action: () => typeChar(char) })),
  { duration: TIMING.postEnterPauseMs, action: pressEnter },
  ...Array.from({ length: TIMING.cycleTicks }, (_, tick) => ({ duration: TIMING.cycleTickMs, action: () => cycleWords(tick) })),
  ...ROUND_ONE_TOKENS.map((token, row) => ({ duration: TIMING.settleStaggerMs, action: () => settleRow(row, token, ROUND_ONE_BARS[row]) })),
  { duration: TIMING.selectTransferMs, action: selectAndTransferTopToken },
  { duration: TIMING.betweenRoundsMs, action: prepNextRound },
  ...Array.from({ length: 10 }, (_, tick) => ({ duration: TIMING.cycleTickMs, action: () => cycleWordsWithSource(tick, ROUND_TWO_CYCLE) })),
  ...ROUND_TWO_TOKENS.map((token, row) => ({ duration: TIMING.settleStaggerMs, action: () => settleRow(row, token, ROUND_TWO_BARS[row]) })),
  { duration: TIMING.selectTransferMs, action: selectAndTransferTopToken },
  { duration: TIMING.betweenRoundsMs, action: prepNextRound },
  ...Array.from({ length: 10 }, (_, tick) => ({ duration: TIMING.cycleTickMs, action: () => cycleWordsWithSource(tick, ROUND_THREE_CYCLE) })),
  ...ROUND_THREE_TOKENS.map((token, row) => ({ duration: TIMING.settleStaggerMs, action: () => settleRow(row, token, ROUND_THREE_BARS[row]) })),
  { duration: TIMING.selectTransferMs, action: selectAndTransferTopToken },
  { duration: TIMING.betweenRoundsMs, action: prepNextRound },
  ...Array.from({ length: 10 }, (_, tick) => ({ duration: TIMING.cycleTickMs, action: () => cycleWordsWithSource(tick, ROUND_FOUR_CYCLE) })),
  ...ROUND_FOUR_TOKENS.map((token, row) => ({ duration: TIMING.settleStaggerMs, action: () => settleRow(row, token, ROUND_FOUR_BARS[row]) })),
  { duration: TIMING.selectTransferMs, action: selectAndTransferTopToken },
  { duration: TIMING.betweenRoundsMs, action: prepNextRound },
  ...Array.from({ length: 10 }, (_, tick) => ({ duration: TIMING.cycleTickMs, action: () => cycleWordsWithSource(tick, ROUND_FIVE_CYCLE) })),
  ...ROUND_FIVE_TOKENS.map((token, row) => ({ duration: TIMING.settleStaggerMs, action: () => settleRow(row, token, ROUND_FIVE_BARS[row]) })),
  { duration: TIMING.selectTransferMs, action: selectAndTransferTopToken },
  { duration: TIMING.betweenRoundsMs, action: prepNextRound },
  ...Array.from({ length: 10 }, (_, tick) => ({ duration: TIMING.cycleTickMs, action: () => cycleWordsWithSource(tick, ROUND_SIX_CYCLE) })),
  ...ROUND_SIX_TOKENS.map((token, row) => ({ duration: TIMING.settleStaggerMs, action: () => settleRow(row, token, ROUND_SIX_BARS[row]) })),
  { duration: TIMING.selectTransferMs, action: selectAndTransferTopToken },
  { duration: TIMING.betweenRoundsMs, action: prepNextRound },
  ...Array.from({ length: 10 }, (_, tick) => ({ duration: TIMING.cycleTickMs, action: () => cycleWordsWithSource(tick, ROUND_SEVEN_CYCLE) })),
  ...ROUND_SEVEN_TOKENS.map((token, row) => ({ duration: TIMING.settleStaggerMs, action: () => settleRow(row, token, ROUND_SEVEN_BARS[row]) })),
  { duration: TIMING.selectTransferMs, action: selectAndTransferTopToken },
  { duration: TIMING.betweenRoundsMs, action: prepNextRound },
  ...Array.from({ length: 10 }, (_, tick) => ({ duration: TIMING.cycleTickMs, action: () => cycleWordsWithSource(tick, ROUND_EIGHT_CYCLE) })),
  ...ROUND_EIGHT_TOKENS.map((token, row) => ({ duration: TIMING.settleStaggerMs, action: () => settleRow(row, token, ROUND_EIGHT_BARS[row]) })),
  { duration: TIMING.selectTransferMs, action: selectEOS },
  { duration: 0, action: finish },
];

function clearTimer() {
  if (state.timeoutId) {
    clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }
}

function setControls() {
  startBtn.disabled = state.running && !state.finished;
  pauseBtn.disabled = !state.running || state.finished;
  pauseBtn.textContent = state.paused ? "Resume" : "Pause";
}

function resetVisuals() {
  chatThread.innerHTML = "";
  chatInput.textContent = "";
  chatInput.classList.remove("typing");
  tableWrap.classList.remove("fading");

  tokenEls.forEach((el) => {
    el.textContent = "";
    el.classList.remove("chosen-token");
  });

  barEls.forEach((bar) => {
    bar.style.width = "0%";
  });

  document.querySelectorAll(".star-burst, .flying-token").forEach((el) => {
    el.remove();
  });
}

function initTyping() {
  chatInput.classList.add("typing");
}

function typeChar(char) {
  chatInput.textContent += char;
}

function pressEnter() {
  const msg = document.createElement("div");
  msg.className = "message";
  msg.textContent = PROMPT;
  chatThread.prepend(msg);

  const assistantMsg = document.createElement("div");
  assistantMsg.className = "assistant-message";
  assistantMsg.innerHTML =
    '<span class="answer-slot" id="answerSlot"></span><span class="answer-meta"><span class="generation-cursor visible" id="generationCursor">|</span><span class="final-status" id="finalStatus">Final</span></span>';
  msg.after(assistantMsg);

  chatInput.textContent = "";
  chatInput.classList.remove("typing");
}

function cycleWords(tick) {
  cycleWordsWithSource(tick, CYCLE_WORDS);
}

function cycleWordsWithSource(tick, sourceWords) {
  tokenEls.forEach((el, row) => {
    const words = sourceWords[row];
    const pick = words[tick % words.length];
    el.textContent = pick;
  });
}

function settleRow(row, token, widthPercent) {
  tokenEls[row].textContent = token;
  barEls[row].style.width = `${widthPercent}%`;
}

function prepNextRound() {
  tableWrap.classList.remove("fading");
  tokenEls.forEach((el) => {
    el.textContent = "";
    el.classList.remove("chosen-token");
  });
  barEls.forEach((bar) => {
    bar.style.width = "0%";
  });
}

function selectAndTransferTopToken() {
  const source = tokenEls[0];
  const target = document.getElementById("answerSlot");
  if (!source || !target) return;
  if (!source.textContent.trim()) return;

  tokenEls.forEach((el) => el.classList.remove("chosen-token"));
  source.classList.add("chosen-token");
  tableWrap.classList.add("fading");
  spawnStarBurst(source);
  flyTokenToTarget(source, target, source.textContent.trim());
}

function selectEOS() {
  const source = tokenEls[0];
  if (!source) return;
  tokenEls.forEach((el) => el.classList.remove("chosen-token"));
  source.classList.add("chosen-token");
  tableWrap.classList.add("fading");
  spawnStarBurst(source);
  hideGenerationCursor();
  showFinalStatus();
}

function spawnStarBurst(source) {
  const rect = source.getBoundingClientRect();
  const burst = document.createElement("div");
  burst.className = "star-burst";
  burst.style.left = `${rect.left + rect.width / 2}px`;
  burst.style.top = `${rect.top + rect.height / 2}px`;

  for (let i = 0; i < 12; i += 1) {
    const star = document.createElement("span");
    const angle = (Math.PI * 2 * i) / 12;
    const distance = 34 + Math.random() * 26;
    const dx = `${Math.cos(angle) * distance}px`;
    const dy = `${Math.sin(angle) * distance}px`;
    star.className = "star";
    star.textContent = "✦";
    star.style.setProperty("--dx", dx);
    star.style.setProperty("--dy", dy);
    star.style.setProperty("--delay", `${Math.random() * 120}ms`);
    burst.appendChild(star);
  }

  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 900);
}

function flyTokenToTarget(source, target, tokenText) {
  const sourceRect = source.getBoundingClientRect();
  const hasExistingText = target.textContent.trim().length > 0;
  const chunk = buildAnswerChunk(tokenText, hasExistingText);
  const marker = document.createElement("span");
  marker.className = "landing-marker";
  marker.textContent = chunk;
  target.appendChild(marker);
  const targetRect = marker.getBoundingClientRect();

  const flyer = document.createElement("div");
  flyer.className = "flying-token";
  flyer.textContent = tokenText;
  flyer.style.left = `${sourceRect.left + sourceRect.width / 2}px`;
  flyer.style.top = `${sourceRect.top + sourceRect.height / 2}px`;
  document.body.appendChild(flyer);

  requestAnimationFrame(() => {
    flyer.classList.add("run");
    flyer.style.left = `${targetRect.left + Math.max(targetRect.width / 2, 18)}px`;
    flyer.style.top = `${targetRect.top + targetRect.height / 2}px`;
  });

  setTimeout(() => {
    const tokenSpan = document.createElement("span");
    tokenSpan.className = "answer-token";
    tokenSpan.textContent = chunk;
    target.appendChild(tokenSpan);
    marker.remove();
    state.answerText = `${state.answerText}${chunk}`;
    target.classList.add("visible");
    flyer.remove();
  }, 920);
}

function buildAnswerChunk(tokenText, hasExistingText) {
  if (!hasExistingText) return tokenText;
  if (tokenText === ".") return ".";
  if (tokenText === ",") return ",";
  return ` ${tokenText}`;
}

function hideGenerationCursor() {
  const cursor = document.getElementById("generationCursor");
  if (cursor) cursor.classList.remove("visible");
}

function showFinalStatus() {
  const finalStatus = document.getElementById("finalStatus");
  if (finalStatus) finalStatus.classList.add("visible");
}

function finish() {
  state.running = false;
  state.finished = true;
  setControls();
}

function scheduleNextStep() {
  if (!state.running || state.paused) return;
  if (state.stepIndex >= steps.length) return;

  const step = steps[state.stepIndex];
  step.action();
  state.stepIndex += 1;

  state.timeoutId = setTimeout(scheduleNextStep, step.duration);
}

function start() {
  if (state.running && !state.finished) return;

  if (state.finished) {
    reset();
  }

  state.running = true;
  state.paused = false;
  setControls();
  scheduleNextStep();
}

function togglePause() {
  if (!state.running || state.finished) return;

  state.paused = !state.paused;
  if (!state.paused) {
    scheduleNextStep();
  } else {
    clearTimer();
  }
  setControls();
}

function reset() {
  clearTimer();
  state.running = false;
  state.paused = false;
  state.finished = false;
  state.stepIndex = 0;
  state.answerText = "";
  resetVisuals();
  setControls();
}

startBtn.addEventListener("click", start);
pauseBtn.addEventListener("click", togglePause);
resetBtn.addEventListener("click", reset);

reset();
