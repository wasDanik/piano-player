class PianoPlayer {
    constructor() {
        this.audioContext = null;
        this.currentMode = 'interactive';
        this.isRecording = false;
        this.recording = {
            name: '',
            duration: 0,
            notes: []
        };
        this.recordStartTime = 0;
        this.pressedKeys = new Set();
        this.keyStartTimes = new Map();
        this.currentSong = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.playStartTime = 0;
        this.pausedTime = 0;
        this.playbackSpeed = 1;
        this.transposeSteps = 0; // Количество полутонов для транспонирования
        this.octaveShift = 0; // Сдвиг по октавам (-2, -1, 0, +1, +2)
        this.scheduledNotes = [];
        this.activeOscillators = new Map();

        this.keyMapping = {
            'q': 'C3', '2': 'C#3', 'w': 'D3', '3': 'D#3', 'e': 'E3',
            'r': 'F3', '5': 'F#3', 't': 'G3', '6': 'G#3', 'y': 'A3',
            '7': 'A#3', 'u': 'B3', 'i': 'C4', '9': 'C#4', 'o': 'D4',
            '0': 'D#4', 'p': 'E4', 'z': 'F4', 's': 'F#4', 'x': 'G4',
            'd': 'G#4', 'c': 'A4', 'f': 'A#4', 'v': 'B4', 'b': 'C5',
            'h': 'C#5', 'n': 'D5', 'j': 'D#5', 'm': 'E5'
        };

        this.noteFrequencies = {
            'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81,
            'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00,
            'A#3': 233.08, 'B3': 246.94, 'C4': 261.63, 'C#4': 277.18, 'D4': 293.66,
            'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00,
            'G#4': 415.30, 'A4': 480.00, 'A#4': 466.16, 'B4': 493.88, 'C5': 523.25,
            'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25
        };

        this.init();
    }

    async init() {
        await this.initAudioContext();
        this.createPianoKeys();
        this.setupEventListeners();
        this.updateStatus('Ready to play!');
    }

    async initAudioContext() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    createPianoKeys() {
        const piano = document.getElementById('piano');
        const notes = ['C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
                     'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
                     'C5', 'C#5', 'D5', 'D#5', 'E5'];

        notes.forEach((note, index) => {
            const key = document.createElement('div');
            key.className = note.includes('#') ? 'key black-key' : 'key white-key';
            key.dataset.note = note;
            
            const keyLabel = Object.keys(this.keyMapping).find(k => this.keyMapping[k] === note);
            if (keyLabel) {
                key.innerHTML = `<span style="padding: 5px;">${keyLabel}</span>`;
            }

            key.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.playNote(note, true);
            });

            key.addEventListener('mouseup', () => {
                this.stopNote(note, true);
            });

            key.addEventListener('mouseleave', () => {
                this.stopNote(note, true);
            });

            piano.appendChild(key);
        });
    }

    setupEventListeners() {
        // Mode switching
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchMode(btn.dataset.mode));
        });

        // Interactive mode controls
        document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecording());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadRecording());

        // Prepared mode controls
        document.getElementById('fileInput').addEventListener('change', (e) => this.loadSong(e));
        document.getElementById('playBtn').addEventListener('click', () => this.playCurrentSong());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pauseSong());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopSong());
        
        
        const speedSlider = document.getElementById('speedSlider');
        speedSlider.addEventListener('input', (e) => {
            this.playbackSpeed = parseFloat(e.target.value);
            document.getElementById('speedValue').textContent = `${this.playbackSpeed}x`;
        });

        

        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // Prevent context menu on piano
        document.getElementById('piano').addEventListener('contextmenu', (e) => e.preventDefault());
    }

    switchMode(mode) {
        this.currentMode = mode;
        
        // Update button states
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Show/hide appropriate controls
        const interactiveControls = document.querySelector('.interactive-controls');
        const preparedControls = document.querySelector('.prepared-controls');
        const progressBar = document.querySelector('.progress-bar');

        if (mode === 'interactive') {
            interactiveControls.style.display = 'flex';
            preparedControls.style.display = 'none';
            progressBar.style.display = 'none';
            this.stopSong();
        } else {
            interactiveControls.style.display = 'none';
            preparedControls.style.display = 'flex';
            progressBar.style.display = 'block';
            this.stopRecording();
        }
    }

    handleKeyDown(e) {
        if (e.repeat) return;
        
        const key = e.key.toLowerCase();
        if (this.keyMapping[key] && !this.pressedKeys.has(key)) {
            this.pressedKeys.add(key);
            this.playNote(this.keyMapping[key], false);
        }
    }

    handleKeyUp(e) {
        const key = e.key.toLowerCase();
        if (this.keyMapping[key] && this.pressedKeys.has(key)) {
            this.pressedKeys.delete(key);
            this.stopNote(this.keyMapping[key], false);
        }
    }

    transpose(steps) {
        this.transposeSteps += steps;
        // Ограничиваем транспонирование от -12 до +12 полутонов
        this.transposeSteps = Math.max(-12, Math.min(12, this.transposeSteps));
        document.getElementById('transposeValue').textContent = this.transposeSteps > 0 ? `+${this.transposeSteps}` : this.transposeSteps.toString();
    }

    resetTranspose() {
        this.transposeSteps = 0;
        document.getElementById('transposeValue').textContent = '0';
    }

    changeOctave(direction) {
        this.octaveShift += direction;
        // Ограничиваем сдвиг октав от -2 до +2
        this.octaveShift = Math.max(-2, Math.min(2, this.octaveShift));
        document.getElementById('octaveValue').textContent = this.octaveShift > 0 ? `+${this.octaveShift}` : this.octaveShift.toString();
    }

    resetOctave() {
        this.octaveShift = 0;
        document.getElementById('octaveValue').textContent = '0';
    }

    // Получить частоту ноты с учетом транспонирования и сдвига октав
    getTransposedFrequency(note) {
        const baseFrequency = this.noteFrequencies[note];
        if (!baseFrequency) return null;
        
        // Сдвиг по октавам (каждая октава = 12 полутонов)
        const totalSemitones = this.transposeSteps + (this.octaveShift * 12);
        
        // Каждый полутон изменяет частоту в 2^(1/12) раз
        const transposedFrequency = baseFrequency * Math.pow(2, totalSemitones / 12);
        return transposedFrequency;
    }

    async playNote(note, isMouseEvent) {
    if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
    }

        // Visual feedback
        const keyElement = document.querySelector(`[data-note="${note}"]`);
        if (keyElement) {
            keyElement.classList.add('pressed');
        }

        // Audio generation
        const frequency = this.getTransposedFrequency(note);
        if (frequency && !this.activeOscillators.has(note)) {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = 'triangle';
            
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
            
            oscillator.start();
            this.activeOscillators.set(note, { oscillator, gainNode });

            // Recording
            if (this.isRecording && this.currentMode === 'interactive') {
                const currentTime = Date.now() - this.recordStartTime;
                this.keyStartTimes.set(note, currentTime);
            }
        }
    }

    stopNote(note, isMouseEvent) {
        // Visual feedback
        const keyElement = document.querySelector(`[data-note="${note}"]`);
        if (keyElement) {
            keyElement.classList.remove('pressed');
        }

        // Audio cleanup
        const oscData = this.activeOscillators.get(note);
        if (oscData) {
            const { oscillator, gainNode } = oscData;
            
            gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
            
            setTimeout(() => {
                try {
                    oscillator.stop();
                } catch (e) {
                    // Oscillator already stopped
                }
            }, 100);
            
            this.activeOscillators.delete(note);

            // Recording
            if (this.isRecording && this.keyStartTimes.has(note) && this.currentMode === 'interactive') {
                const startTime = this.keyStartTimes.get(note);
                const currentTime = Date.now() - this.recordStartTime;
                const duration = currentTime - startTime;

                this.recording.notes.push({
                    key: note,
                    startTime: startTime,
                    duration: duration
                });

                this.keyStartTimes.delete(note);
            }
        }
    }

    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    startRecording() {
        this.isRecording = true;
        this.recordStartTime = Date.now();
        this.recording = {
            name: `Recording ${new Date().toLocaleString()}`,
            duration: 0,
            notes: []
        };

        const recordBtn = document.getElementById('recordBtn');
        recordBtn.textContent = '⏹️ Stop Recording';
        recordBtn.classList.add('recording');

        this.updateStatus('🔴 Recording...', 'recording');
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;
        this.recording.duration = Date.now() - this.recordStartTime;

        // Stop any currently playing notes in recording
        this.keyStartTimes.forEach((startTime, note) => {
            const duration = this.recording.duration - startTime;
            this.recording.notes.push({
                key: note,
                startTime: startTime,
                duration: duration
            });
        });
        this.keyStartTimes.clear();

        const recordBtn = document.getElementById('recordBtn');
        recordBtn.textContent = '🔴 Start Recording';
        recordBtn.classList.remove('recording');

        document.getElementById('downloadBtn').disabled = false;
        this.updateStatus(`Recording stopped. Duration: ${(this.recording.duration / 1000).toFixed(1)}s`);
    }

    downloadRecording() {
        if (this.recording.notes.length === 0) {
            alert('No recording to download!');
            return;
        }

        const blob = new Blob([JSON.stringify(this.recording, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `piano-recording-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    loadSong(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const songData = JSON.parse(e.target.result);
                if (this.validateSongData(songData)) {
                    this.currentSong = songData;
                    document.getElementById('playBtn').disabled = false;
                    this.updateStatus(`Loaded: ${songData.name} (${(songData.duration / 1000).toFixed(1)}s)`);
                } else {
                    alert('Invalid song format!');
                }
            } catch (error) {
                alert('Error loading song file!');
            }
        };
        reader.readAsText(file);
    }

    validateSongData(data) {
        return data && 
               typeof data.name === 'string' && 
               typeof data.duration === 'number' && 
               Array.isArray(data.notes) &&
               data.notes.every(note => 
                   typeof note.key === 'string' && 
                   typeof note.startTime === 'number' && 
                   typeof note.duration === 'number'
               );
    }

    playCurrentSong() {
        if (!this.currentSong) return;

        this.isPlaying = true;
        this.isPaused = false;
        this.playStartTime = this.audioContext.currentTime;
        this.pausedTime = 0;

        document.getElementById('playBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;
        document.getElementById('stopBtn').disabled = false;

        this.updateStatus('▶️ Playing...', 'playing');
        this.scheduleNotes();
        this.updateProgress();
    }

    scheduleNotes() {
        const currentTime = this.audioContext.currentTime;
        
        this.currentSong.notes.forEach(note => {
            const adjustedStartTime = (note.startTime / 1000) / this.playbackSpeed;
            const adjustedDuration = (note.duration / 1000) / this.playbackSpeed;
            const scheduleTime = currentTime + adjustedStartTime - this.pausedTime;

            if (scheduleTime > currentTime) {
                // Schedule note start
                setTimeout(() => {
                    if (this.isPlaying && !this.isPaused) {
                        this.highlightUpcomingNote(note.key);
                        this.playNote(note.key, false);
                    }
                }, (scheduleTime - currentTime) * 1000);

                // Schedule note end
                setTimeout(() => {
                    if (this.isPlaying) {
                        this.stopNote(note.key, false);
                        this.removeHighlight(note.key);
                    }
                }, (scheduleTime + adjustedDuration - currentTime) * 1000);
            }
        });
    }

    highlightUpcomingNote(note) {
        const keyElement = document.querySelector(`[data-note="${note}"]`);
        if (keyElement) {
            keyElement.classList.add('upcoming');
        }
    }

    removeHighlight(note) {
        const keyElement = document.querySelector(`[data-note="${note}"]`);
        if (keyElement) {
            keyElement.classList.remove('upcoming');
        }
    }

    pauseSong() {
        if (!this.isPlaying || this.isPaused) return;

        this.isPaused = true;
        this.pausedTime = this.audioContext.currentTime - this.playStartTime;

        // Stop all active notes
        this.activeOscillators.forEach((_, note) => {
            this.stopNote(note, false);
        });

        document.getElementById('playBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;

        this.updateStatus('⏸️ Paused');
    }

    stopSong() {
        this.isPlaying = false;
        this.isPaused = false;
        this.pausedTime = 0;

        // Stop all active notes and clear highlights
        this.activeOscillators.forEach((_, note) => {
            this.stopNote(note, false);
        });

        document.querySelectorAll('.key').forEach(key => {
            key.classList.remove('upcoming', 'pressed');
        });

        document.getElementById('playBtn').disabled = this.currentSong === null;
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('stopBtn').disabled = true;

        // Reset progress bar
        document.querySelector('.progress-fill').style.width = '0%';

        this.updateStatus(this.currentSong ? 'Ready to play' : 'Load a song to play');
    }

    updateProgress() {
        if (!this.isPlaying || this.isPaused) return;

        const elapsed = (this.audioContext.currentTime - this.playStartTime + this.pausedTime) * 1000 * this.playbackSpeed;
        const progress = Math.min(elapsed / this.currentSong.duration, 1) * 100;
        
        document.querySelector('.progress-fill').style.width = `${progress}%`;

        if (progress >= 100) {
            this.stopSong();
            this.updateStatus('🎵 Song finished!');
        } else {
            requestAnimationFrame(() => this.updateProgress());
        }
    }

    updateStatus(message, type = '') {
        const status = document.getElementById('status');
        status.textContent = message;
        status.className = `status ${type}`;
    }
}

// Initialize the piano player when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new PianoPlayer();
});