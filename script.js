const versions = [
  {
    file: "assets/audio/version-01.mp3",
    title: "The Original Instrumental",
    description: "The first recorded version of the song.",
    date: "01 — DEMO"
  },
  {
    file: "assets/audio/version-02.mp3",
    title: "Vocal Take with Rough Mix",
    description: "Added lyrics with a rough revision of the instrumental mix.",
    date: "02 — ROUGH MIX"
  },
  {
    file: "assets/audio/version-03.mp3",
    title: "Revision",
    description: "New instrumentation and vocal takes with more mix experimentation.",
    date: "03 — REVISED MIX"
  },
  {
    file: "assets/audio/version-04.mp3",
    title: "New Recordings",
    description: "The song begins to resemble its final form, with finalised takes.",
    date: "04 — FINAL TAKES"
  },
  {
    file: "assets/audio/version-05.mp3",
    title: "Final Mix",
    description: "The completed version of the song, as released on platforms.",
    date: "05 — FINAL"
  }
];

const slider = document.getElementById("version-slider");
const playButton = document.getElementById("play-button");
const playLabel = document.getElementById("play-label");
const statusText = document.getElementById("status");
const versionDate = document.getElementById("version-date");
const versionTitle = document.getElementById("version-title");
const versionDescription = document.getElementById("version-description");
const currentTimeText = document.getElementById("current-time");
const durationText = document.getElementById("duration");
const stagePoints = document.getElementById("stage-points");
const waveformCanvas = document.getElementById("waveform");
const parallaxElements = document.querySelectorAll(".parallax-element");

const floatingImageMotion = Array.from(parallaxElements).map((element, index) => ({
  element,
  angle: (Math.random() * 12) - 6,
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  speedX: 0,
  speedY: 0,
  index
}));

function gaussianRandom(mean = 0, standardDeviation = 1) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + standardDeviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function chooseFloatingDirection(motion) {
  motion.targetX += gaussianRandom(0, 18);
  motion.targetY += gaussianRandom(0, 18);
}

floatingImageMotion.forEach((motion) => chooseFloatingDirection(motion));

let audioContext = null;
let analyser = null;
let masterGain = null;
let audioBuffers = [];
let sourceNodes = [];
let versionGains = [];

let currentPosition = 0;
let targetPosition = 0;
let isPlaying = false;
let playbackOffset = 0;
let playbackStartedAt = 0;
let animationFrame = 0;
let audioDuration = 0;
let loadingCount = 0;
let loadFailed = false;

const stagePointElements = [];

function createStagePoints() {
  versions.forEach((version, index) => {
    const point = document.createElement("span");
    point.className = "stage-point";
    point.setAttribute("aria-hidden", "true");
    point.dataset.index = index;
    stagePoints.appendChild(point);
    stagePointElements.push(point);
  });
}

function updateVersionInfo() {
  const selectedIndex = Math.round(currentPosition);
  const selected = versions[selectedIndex];

  versionDate.textContent = selected.date;
  versionTitle.textContent = selected.title;
  versionDescription.textContent = selected.description;

  stagePointElements.forEach((point, index) => {
    point.classList.toggle("active", index === selectedIndex);
  });
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

async function createAudioGraph() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.9;

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;

  masterGain.connect(analyser);
  analyser.connect(audioContext.destination);

  audioBuffers = await Promise.all(
    versions.map(async (version, index) => {
      try {
        const response = await fetch(version.file);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = await audioContext.decodeAudioData(arrayBuffer);

        loadingCount += 1;
        statusText.textContent = `Loaded ${loadingCount} of ${versions.length} audio versions`;

        if (index === 0) {
          audioDuration = buffer.duration;
        }

        return buffer;
      } catch (error) {
        loadFailed = true;
        console.error(`Could not load ${version.file}`, error);
        throw new Error(`Could not load ${version.file}`);
      }
    })
  );

  if (!audioBuffers.length) {
    throw new Error("No audio buffers loaded.");
  }
}

function createSources(offset = 0) {
  stopSources();

  sourceNodes = [];
  versionGains = [];

  audioBuffers.forEach((buffer) => {
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();

    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;

    source.connect(gainNode);
    gainNode.connect(masterGain);

    sourceNodes.push(source);
    versionGains.push(gainNode);
  });

  updateGains(true);

  const startAt = audioContext.currentTime + 0.05;
  sourceNodes.forEach((source) => {
    source.start(startAt, offset % audioDuration);
  });

  playbackStartedAt = startAt;
}

function stopSources() {
  sourceNodes.forEach((source) => {
    try {
      source.stop();
    } catch (error) {
      // The node may already have stopped.
    }
  });

  sourceNodes = [];
  versionGains = [];
}

function getPlaybackTime() {
  if (!isPlaying || !audioContext || !audioDuration) {
    return playbackOffset % (audioDuration || 1);
  }

  const elapsed = audioContext.currentTime - playbackStartedAt;
  return (playbackOffset + elapsed) % audioDuration;
}

function updateGains(immediate = false) {
  if (!audioContext || !versionGains.length) {
    return;
  }

  const now = audioContext.currentTime;
  const timeConstant = immediate ? 0.005 : 0.035;

  versionGains.forEach((gainNode, index) => {
    const distance = Math.abs(index - currentPosition);
    const weight = Math.max(0, 1 - distance);

    gainNode.gain.setTargetAtTime(
      weight,
      now,
      timeConstant
    );
  });
}

async function togglePlayback() {
  if (!audioContext || !audioBuffers.length) {
    return;
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  if (!isPlaying) {
    createSources(playbackOffset);
    isPlaying = true;
    playLabel.textContent = "PAUSE";
    statusText.textContent = "Playing — drag the timeline to hear the evolution";
    updatePlaybackReadout();
    return;
  }

  playbackOffset = getPlaybackTime();
  stopSources();
  isPlaying = false;
  playLabel.textContent = "PLAY";
  statusText.textContent = "Paused";
  updatePlaybackReadout();
}

function updatePlaybackReadout() {
  currentTimeText.textContent = formatTime(getPlaybackTime());
  durationText.textContent = formatTime(audioDuration);
}

function updateSliderPosition() {
  targetPosition = Number.parseFloat(slider.value);
}

function updateParallax() {
  const scrollY = window.scrollY || 0;
  floatingImageMotion.forEach((motion, index) => {
    const speed = index === 0 ? 0.045 : -0.035;
    motion.element.style.transform = `translate3d(${motion.x}px, ${scrollY * speed + motion.y}px, 0) rotate(${motion.angle}deg)`;
  });
}

function updateFloatingImageMotion() {
  floatingImageMotion.forEach((motion) => {
    if (!isPlaying) return;

    if (Math.abs(motion.targetX - motion.x) < 2 && Math.abs(motion.targetY - motion.y) < 2) {
      chooseFloatingDirection(motion);
    }

    motion.x += (motion.targetX - motion.x) * 0.0025;
    motion.y += (motion.targetY - motion.y) * 0.0025;
    motion.angle += gaussianRandom(0, 0.006);
    motion.angle = Math.max(-8, Math.min(8, motion.angle));
  });

  updateParallax();
}

function bindEvents() {
  slider.addEventListener("input", () => {
    updateSliderPosition();
  });

  playButton.addEventListener("click", () => {
    togglePlayback().catch((error) => {
      console.error(error);
      statusText.textContent = "Playback could not start";
    });
  });

  const artwork = document.querySelector(".album-art");

  artwork.addEventListener("error", () => {
    artwork.style.display = "none";
    artwork.parentElement.classList.add("artwork-failed");
  });

  window.addEventListener("resize", resizeWaveformCanvas);
  window.addEventListener("scroll", updateParallax, { passive: true });
  updateParallax();
}

function resizeWaveformCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = waveformCanvas.getBoundingClientRect();

  waveformCanvas.width = Math.max(1, Math.floor(rect.width * ratio));
  waveformCanvas.height = Math.max(1, Math.floor(rect.height * ratio));

  const context = waveformCanvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawIdleWaveform(context, width, height) {
  context.clearRect(0, 0, width, height);
  context.beginPath();
  context.strokeStyle = "rgb(143, 217, 210)";
  context.lineWidth = 1;

  for (let x = 0; x <= width; x += 8) {
    const y = height / 2 + Math.sin(x * 0.035) * 3;
    if (x === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.stroke();
}

function drawWaveform() {
  const context = waveformCanvas.getContext("2d");
  const width = waveformCanvas.clientWidth;
  const height = waveformCanvas.clientHeight;

  context.clearRect(0, 0, width, height);

  if (!isPlaying || !analyser) {
    drawIdleWaveform(context, width, height);
    return;
  }

  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);

  context.beginPath();
  context.strokeStyle = "rgb(143, 217, 210)";
  context.lineWidth = 1;

  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * width;
    const normalised = data[i] / 255;
    const y = normalised * height;

    if (i === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.stroke();
}

function animationLoop() {
  currentPosition += (targetPosition - currentPosition) * 0.12;

  if (Math.abs(targetPosition - currentPosition) < 0.0005) {
    currentPosition = targetPosition;
  }

  updateVersionInfo();
  updateGains();
  updatePlaybackReadout();

  drawWaveform();
  updateFloatingImageMotion();

  animationFrame = requestAnimationFrame(animationLoop);
}

async function initialise() {
  createStagePoints();
  bindEvents();
  updateVersionInfo();
  resizeWaveformCanvas();
  drawWaveform();

  try {
    statusText.textContent = "Loading audio versions…";
    await createAudioGraph();

    durationText.textContent = formatTime(audioDuration);
    playButton.disabled = false;
    playLabel.textContent = "PLAY";
    statusText.textContent = "Ready — move through the timeline, then press play";
  } catch (error) {
    console.error(error);
    playButton.disabled = true;
    playLabel.textContent = "ERROR";
    statusText.textContent = loadFailed
      ? "One or more audio files could not be loaded"
      : "Audio could not be prepared";
  }

  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(animationLoop);
}

initialise();
