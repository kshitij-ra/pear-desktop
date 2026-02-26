let queueChangeWaiters = [];

function waitForQueueChanged(timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            queueChangeWaiters = queueChangeWaiters.filter(w => w !== done);
            reject(new Error("QUEUE_CHANGED timeout"));
        }, timeoutMs);

        const done = () => {
            clearTimeout(timeout);
            resolve(true);
        };

        queueChangeWaiters.push(done);
    });
}

const $ = (selector) => document.querySelector(selector);

const API_VERSION = 'v1'; // This should match backend/api-version.ts
const getPrefix = (withVer = true) => {
    // Use the injected API_SERVER_PORT if available, otherwise use same port as UI
    const apiPort = window.API_SERVER_PORT || window.location.port || '26538';
    const apiHost = `${window.location.protocol}//${window.location.hostname}:${apiPort}`;
    return (withVer ? `${apiHost}/api/${API_VERSION}` : apiHost);
};

let lastState = null;
let socket = null;

const humanReadableSeconds = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    seconds = Math.floor(seconds);
    if (seconds < 60) return `00:${seconds < 10 ? '0' : ''}${seconds}`;
    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes < 10 ? '0' : ''}${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    }
    const hours = Math.floor(seconds / 3600);
    const remainingMinutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours < 10 ? '0' : ''}${hours}:${remainingMinutes < 10 ? '0' : ''}${remainingMinutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
};

// State for dragging
let isDraggingProgress = false;
let isDraggingVolume = false;
let lastProgressInteraction = 0;
let lastVolumeInteraction = 0;
const INTERACTION_COOLDOWN = 1000; // ms

// Smooth Progress State
let currentSongDuration = 0;
let currentPosition = 0;
let lastPositionUpdate = 0;
let isSongPlaying = false;
let isLive = false;

function updateProgressBar() {
    if (!isLive && !isDraggingProgress && currentSongDuration > 0) {
        let displayPosition = currentPosition;

        if (isSongPlaying) {
            const elapsed = (Date.now() - lastPositionUpdate) / 1000;
            displayPosition = currentPosition + elapsed;
        }

        // Clamp
        if (displayPosition > currentSongDuration) displayPosition = currentSongDuration;

        const durationPercent = displayPosition / currentSongDuration;
        $('#progressbar').style.transform = `scaleX(${durationPercent})`;
        $('#progressSliderKnob').style.left = `${durationPercent * 100}%`;
        $('.currenttime').innerText = humanReadableSeconds(displayPosition);
    }
    requestAnimationFrame(updateProgressBar);
}

// Start the loop
requestAnimationFrame(updateProgressBar);

function displayState(state) {
    const { song, isPlaying, muted, position, volume, repeat, shuffle, likeStatus } = state;

    // If no song is playing or just initialized empty
    if (!song) {
        // Welcome State
        $('.controldetails').style.display = 'none';
        $('#welcome-message').style.display = 'block';

        const albumArts = document.getElementsByClassName('albumart');
        for (let i = 0; i < albumArts.length; i++) {
            // YT Music Logo
            albumArts[i].src = 'https://upload.wikimedia.org/wikipedia/commons/6/6a/Youtube_Music_icon.svg';
            albumArts[i].style.objectFit = 'contain';
            albumArts[i].style.padding = '20px';
        }

        // Ensure queue is updated (empty)
        if (!lastState || !lastState.song) {
            updateQueue();
        }

        lastState = state;
        return;
    }

    // Player State
    $('.controldetails').style.display = 'block';
    $('#welcome-message').style.display = 'none';

    if (!lastState || lastState.song?.artist !== song.artist) {
        $('#artist').innerText = song.artist || 'Unknown Artist';
    }

    if (!lastState || lastState.song?.title !== song.title) {
        $('#title').innerText = song.title || 'Unknown Title';
    }

    // Like Status
    if (!lastState || lastState.likeStatus !== likeStatus) {
        const likeIcon = $('#control-like svg use');
        const dislikeIcon = $('#control-dislike svg use');

        if (likeStatus === 'LIKE') {
            likeIcon.setAttribute('href', '#like-filled');
            dislikeIcon.setAttribute('href', '#dislike-outline');
        } else if (likeStatus === 'DISLIKE') {
            likeIcon.setAttribute('href', '#like-outline');
            dislikeIcon.setAttribute('href', '#dislike-filled');
        } else {
            likeIcon.setAttribute('href', '#like-outline');
            dislikeIcon.setAttribute('href', '#dislike-outline');
        }
    }

    // Album Art
    if (!lastState || lastState.song?.videoId !== song.videoId) {
        const albumArts = document.getElementsByClassName('albumart');
        for (let i = 0; i < albumArts.length; i++) {
            albumArts[i].src = song.imageSrc || 'https://via.placeholder.com/544/000?text=No%20Cover';
            albumArts[i].style.objectFit = 'cover';
            albumArts[i].style.padding = '0';
            albumArts[i].style.background = 'transparent';
        }
        $('.totaltime').innerText = humanReadableSeconds(song.songDuration);
        updateQueue();
    }

    // Play/Pause
    if (!lastState || lastState.isPlaying !== isPlaying) {
        const playPauseIcon = $('#control-playpause div svg use');
        playPauseIcon.setAttribute('href', isPlaying ? '#pause' : '#play');
    }

    // Repeat Mode
    if (!lastState || lastState.repeat !== repeat) {
        const repeatIcon = $('#control-repeat svg use');
        repeatIcon.setAttribute('data-state', repeat);
        if (repeat === 'NONE') repeatIcon.setAttribute('href', '#repeat-off');
        else if (repeat === 'ALL') repeatIcon.setAttribute('href', '#repeat-queue');
        else if (repeat === 'ONE') repeatIcon.setAttribute('href', '#repeat-song');
    }

    // Shuffle Mode
    if (!lastState || lastState.shuffle !== shuffle) {
        const shuffleIcon = $('#control-shuffle svg use');
        // Assuming you have styles or icons for shuffle on/off. If only color changes, handled by CSS usually.
        // But let's assume we might want to toggle a class or attribute if needed.
        // For now, existing code didn't do much for shuffle visual other than click. 
        // Let's ensure it reflects state if we had distinct icons.
        // If generic material, usually it keeps same icon but changes color. CSS handles .active or attribute.
        // The original code didn't have shuffle logic in displayState, adding it now.
        $('#control-shuffle').setAttribute('data-active', shuffle);
    }

    // Progress
    if (song.isLive) {
        isLive = true;
        $('#progressSliderBar').style.display = 'none';
        $('#progressSliderKnob').style.display = 'none';
        $('.currenttime').style.display = 'none';
        $('.totaltime').style.display = 'none';
    } else {
        isLive = false;
        $('#progressSliderBar').style.display = 'block';
        $('#progressSliderKnob').style.display = 'block';
        $('.currenttime').style.display = 'block';
        $('.totaltime').style.display = 'block';

        // Update local state for smooth animation
        currentSongDuration = song.songDuration;
        // Only update position if we aren't dragging to avoid jumping
        // But we essentially rely on the animation loop now
        currentPosition = position;
        lastPositionUpdate = Date.now();
        isSongPlaying = isPlaying;
    }

    // Volume
    if (!isDraggingVolume && (Date.now() - lastVolumeInteraction > INTERACTION_COOLDOWN) && (!lastState || lastState.volume !== volume || lastState.muted !== muted)) {
        $('#volumebar').style.transform = `scaleX(${volume / 100})`;
        $('#volumeSliderKnob').style.left = `${volume}%`;
        const volumeToggleIcon = $('#control-volume-toggle svg use');
        volumeToggleIcon.setAttribute('href', muted ? '#volume-mute' : '#volume');
    }

    lastState = state;
}

async function updateQueue() {
    try {
        const response = await fetch(`${getPrefix()}/queue`);
        if (response.status === 200) {
            const queueData = await response.json();
            const queueContainer = $('#queue');
            const template = $('#queue-item-template');
            queueContainer.innerHTML = '';

            if (queueData.items && queueData.items.length > 0) {
                console.log('Queue data items:', queueData.items);
                queueData.items.forEach((item, index) => {
                    const renderer = item.playlistPanelVideoRenderer ||
                        item.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer;

                    if (!renderer) {
                        console.warn('Queue item missing renderer:', item);
                        return;
                    }

                    const clone = template.content.cloneNode(true);
                    const queueItem = clone.querySelector('.queue-item');

                    if (renderer.selected) queueItem.classList.add('selected');

                    const thumbs = renderer.thumbnail?.thumbnails;
                    const thumbUrl = thumbs ? thumbs[thumbs.length - 1].url : 'https://via.placeholder.com/64/000?text=No%20Image';
                    clone.querySelector('.queue-albumart').src = thumbUrl;
                    clone.querySelector('.queue-item-title').innerText = renderer.title?.runs?.[0]?.text || 'Unknown Title';
                    clone.querySelector('.queue-item-artist').innerText = renderer.longBylineText?.runs?.[0]?.text || renderer.shortBylineText?.runs?.[0]?.text || 'Unknown Artist';
                    clone.querySelector('.queue-item-duration').innerText = renderer.lengthText?.runs?.[0]?.text || '';

                    queueItem.setAttribute('queue-index', index);
                    queueItem.addEventListener('click', () => {
                        sendCommand('queue', { index }, 'PATCH');
                    });

                    queueContainer.appendChild(clone);
                });
            } else {
                console.log('Queue is empty or items is missing/length 0');
                const emptyMsg = document.createElement('div');
                emptyMsg.innerText = 'Queue is empty';
                emptyMsg.style.padding = '20px';
                emptyMsg.style.textAlign = 'center';
                emptyMsg.style.color = '#ccc';
                queueContainer.appendChild(emptyMsg);
            }
        }
    } catch (e) {
        console.error('Failed to update queue', e);
    }
}

async function updatePlaylists() {
    try {
        const response = await fetch(`${getPrefix()}/playlists`);
        if (response.status === 200) {
            const playlistsData = await response.json();
            console.log('Full playlists response:', playlistsData);

            const playlistsContainer = $('#playlists');
            const template = $('#playlist-item-template');
            playlistsContainer.innerHTML = '';

            // Parse the YouTube Music browse response
            let playlists = [];
            try {
                // Log the structure to help debug
                console.log('Response structure:', JSON.stringify(playlistsData, null, 2).substring(0, 1000));

                // Navigate to the gridRenderer that contains playlist items
                const contents = playlistsData?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;

                if (contents && contents.length > 0) {
                    console.log('Found contents, length:', contents.length);

                    // Look for the gridRenderer in the first section
                    const gridRenderer = contents[0]?.gridRenderer;
                    if (gridRenderer?.items) {
                        console.log(`Found gridRenderer with ${gridRenderer.items.length} items`);

                        // Filter out the "New playlist" button and get actual playlists
                        playlists = gridRenderer.items.filter(item => {
                            const renderer = item.musicTwoRowItemRenderer;
                            // Skip items that have createPlaylistEndpoint (the "New playlist" button)
                            return renderer && renderer.navigationEndpoint?.browseEndpoint;
                        });

                        console.log(`Filtered to ${playlists.length} actual playlists`);
                    }
                }
            } catch (e) {
                console.warn('Error parsing playlists data', e);
            }

            console.log('Total playlists found:', playlists.length);
            if (playlists.length > 0) {
                console.log('First playlist:', playlists[0]);
            }

            if (playlists.length > 0) {
                playlists.forEach((item, idx) => {
                    console.log(`Playlist ${idx}:`, Object.keys(item));
                    const renderer = item.musicTwoRowItemRenderer;
                    if (!renderer) {
                        console.warn(`Playlist ${idx} missing musicTwoRowItemRenderer`);
                        return;
                    }

                    const clone = template.content.cloneNode(true);
                    const playlistItem = clone.querySelector('.playlist-item');

                    // Thumbnail
                    const thumbs = renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails;
                    const thumbUrl = thumbs ? thumbs[thumbs.length - 1].url : 'https://via.placeholder.com/64/000?text=Playlist';
                    clone.querySelector('.queue-albumart').src = thumbUrl;

                    // Title
                    clone.querySelector('.queue-item-title').innerText = renderer.title?.runs?.[0]?.text || 'Unknown Playlist';

                    // Subtitle (song count)
                    clone.querySelector('.queue-item-artist').innerText = renderer.subtitle?.runs?.[0]?.text || '';

                    // Get browse ID for navigation
                    const browseId = renderer.navigationEndpoint?.browseEndpoint?.browseId;
                    console.log(`Playlist "${renderer.title?.runs?.[0]?.text}" browseId:`, browseId);

                    if (browseId) {
                        playlistItem.addEventListener('click', async () => {
                            try {
                                await sendCommand('playlists/play', { playlistId: browseId });
                            } catch (e) {
                                console.error('Failed to play playlist', e);
                            }
                        });
                    }

                    playlistsContainer.appendChild(clone);
                });
            } else {
                console.log('No playlists found in response');
                const emptyMsg = document.createElement('div');
                emptyMsg.innerText = 'No playlists found';
                emptyMsg.style.padding = '20px';
                emptyMsg.style.textAlign = 'center';
                emptyMsg.style.color = '#ccc';
                playlistsContainer.appendChild(emptyMsg);
            }
        } else {
            console.log('Response status:', response.status);
            const playlistsContainer = $('#playlists');
            playlistsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #ccc;">No playlists available</div>';
        }
    } catch (e) {
        console.error('Failed to update playlists', e);
        const playlistsContainer = $('#playlists');
        playlistsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #ccc;">Error loading playlists</div>';
    }
}

async function sendCommand(command, data = null, method = 'POST') {
    const url = `${getPrefix()}/${command}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    if (data) options.body = JSON.stringify(data);

    try {
        const response = await fetch(url, options);
        if (response.status >= 400) {
            const err = await response.json();
            showError(err.message || 'Error executing command');
            return false;
        }
        return true;
    } catch (e) {
        showError('Network error');
        return false;
    }
}

function showError(msg) {
    const dialog = $('#error-dialog');
    dialog.querySelector('p').innerText = msg;
    dialog.showModal();
}

$('#error-dialog-close').addEventListener('click', () => $('#error-dialog').close());

// Controls
$('#control-playpause').addEventListener('click', () => sendCommand('toggle-play'));
$('#control-previous').addEventListener('click', () => sendCommand('previous'));
$('#control-next').addEventListener('click', () => sendCommand('next'));
$('#control-shuffle').addEventListener('click', () => sendCommand('shuffle'));
$('#control-like').addEventListener('click', () => sendCommand('like'));
$('#control-dislike').addEventListener('click', () => sendCommand('dislike'));
$('#control-volume-toggle').addEventListener('click', () => sendCommand('toggle-mute'));

$('#control-repeat').addEventListener('click', () => {
    // API uses iteration for switch-repeat
    sendCommand('switch-repeat', { iteration: 1 });
});


// Progress Slider Logic
const progressSliderBar = $('#progressSliderBar');
const progressSliderKnob = $('#progressSliderKnob');

function updateProgressFromEvent(e) {
    if (!lastState || !lastState.song) return;
    const rect = progressSliderBar.getBoundingClientRect();
    let percent = (e.clientX - rect.left) / rect.width;
    percent = Math.max(0, Math.min(1, percent));

    $('#progressbar').style.transform = `scaleX(${percent})`;
    progressSliderKnob.style.left = `${percent * 100}%`;
    $('.currenttime').innerText = humanReadableSeconds(lastState.song.songDuration * percent);
    return percent;
}

progressSliderBar.addEventListener('pointerdown', (e) => {
    isDraggingProgress = true;
    lastProgressInteraction = Date.now();
    e.target.setPointerCapture(e.pointerId);
    updateProgressFromEvent(e);
});

progressSliderKnob.addEventListener('pointerdown', (e) => {
    isDraggingProgress = true;
    lastProgressInteraction = Date.now();
    e.target.setPointerCapture(e.pointerId);
    e.stopPropagation(); // Prevent bubbling if needed
});

progressSliderBar.addEventListener('pointermove', (e) => {
    if (isDraggingProgress) {
        lastProgressInteraction = Date.now();
        updateProgressFromEvent(e);
    }
});

progressSliderKnob.addEventListener('pointermove', (e) => {
    if (isDraggingProgress) {
        lastProgressInteraction = Date.now();
        updateProgressFromEvent(e);
    }
});


progressSliderBar.addEventListener('pointerup', (e) => {
    if (isDraggingProgress) {
        isDraggingProgress = false;
        lastProgressInteraction = Date.now();
        e.target.releasePointerCapture(e.pointerId);
        const percent = updateProgressFromEvent(e);
        if (lastState && lastState.song) {
            sendCommand('seek-to', { seconds: lastState.song.songDuration * percent });
        }
    }
});
progressSliderKnob.addEventListener('pointerup', (e) => {
    if (isDraggingProgress) {
        isDraggingProgress = false;
        lastProgressInteraction = Date.now();
        e.target.releasePointerCapture(e.pointerId);
        const percent = updateProgressFromEvent(e);
        if (lastState && lastState.song) {
            sendCommand('seek-to', { seconds: lastState.song.songDuration * percent });
        }
    }
});



// Volume Slider Logic
const volumeSliderBar = $('#volumeSliderBar');
const volumeSliderKnob = $('#volumeSliderKnob');

function updateVolumeFromEvent(e) {
    const rect = volumeSliderBar.getBoundingClientRect();
    let percent = (e.clientX - rect.left) / rect.width;
    percent = Math.max(0, Math.min(1, percent));

    $('#volumebar').style.transform = `scaleX(${percent})`;
    volumeSliderKnob.style.left = `${percent * 100}%`;
    return Math.round(percent * 100);
}

volumeSliderBar.addEventListener('pointerdown', (e) => {
    isDraggingVolume = true;
    lastVolumeInteraction = Date.now();
    e.target.setPointerCapture(e.pointerId);
    updateVolumeFromEvent(e);
});

volumeSliderKnob.addEventListener('pointerdown', (e) => {
    isDraggingVolume = true;
    lastVolumeInteraction = Date.now();
    e.target.setPointerCapture(e.pointerId);
    e.stopPropagation();
});

volumeSliderBar.addEventListener('pointermove', (e) => {
    if (isDraggingVolume) {
        lastVolumeInteraction = Date.now();
        updateVolumeFromEvent(e);
    }
});

volumeSliderKnob.addEventListener('pointermove', (e) => {
    if (isDraggingVolume) {
        lastVolumeInteraction = Date.now();
        updateVolumeFromEvent(e);
    }
});

volumeSliderBar.addEventListener('pointerup', (e) => {
    if (isDraggingVolume) {
        isDraggingVolume = false;
        lastVolumeInteraction = Date.now();
        e.target.releasePointerCapture(e.pointerId);
        const vol = updateVolumeFromEvent(e);
        sendCommand('volume', { volume: vol });
    }
});
volumeSliderKnob.addEventListener('pointerup', (e) => {
    if (isDraggingVolume) {
        isDraggingVolume = false;
        lastVolumeInteraction = Date.now();
        e.target.releasePointerCapture(e.pointerId);
        const vol = updateVolumeFromEvent(e);
        sendCommand('volume', { volume: vol });
    }
});

// WebSocket
function initWS() {
    // Construct WebSocket URL for the API server
    const apiPort = window.API_SERVER_PORT || window.location.port || '26538';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:${apiPort}/api/${API_VERSION}/ws`;

    socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'PLAYER_INFO') {
            displayState(data);
        } else if (data.type === 'QUEUE_CHANGED') {
            updateQueue();
            queueChangeWaiters.forEach(fn => fn());
            queueChangeWaiters = [];
        } else if (data.type === 'VIDEO_CHANGED') {
            displayState({
                ...lastState,
                song: data.song,
                position: data.position,
                isPlaying: data.isPlaying
            });
        } else if (data.type === 'PLAYER_STATE_CHANGED') {
            displayState({ ...lastState, isPlaying: data.isPlaying, position: data.position });
        } else if (data.type === 'POSITION_CHANGED') {
            displayState({ ...lastState, position: data.position });
        } else if (data.type === 'VOLUME_CHANGED') {
            displayState({ ...lastState, volume: data.volume, muted: data.muted });
        } else if (data.type === 'REPEAT_CHANGED') {
            displayState({ ...lastState, repeat: data.repeat });
        } else if (data.type === 'SHUFFLE_CHANGED') {
            displayState({ ...lastState, shuffle: data.shuffle });
        } else if (data.type === 'LIKE_CHANGED') {
            displayState({ ...lastState, likeStatus: data.likeStatus });
        }
    };

    socket.onclose = () => {
        setTimeout(initWS, 1000);
    };
}

document.addEventListener('DOMContentLoaded', () => {
    // Drawer
    const bottomDraw = document.querySelector('.bottom-draw');
    document.querySelector('.material-header').addEventListener('click', (e) => {
        // Prevent toggle if clicking a tab
        if (e.target.closest('.material-tab')) return;

        if (bottomDraw.hasAttribute('open')) {
            bottomDraw.removeAttribute('open');
        } else {
            bottomDraw.setAttribute('open', '');
        }
    });

    // Expose for debugging
    window.toggleQueue = () => {
        if (bottomDraw.hasAttribute('open')) {
            bottomDraw.removeAttribute('open');
        } else {
            bottomDraw.setAttribute('open', '');
        }
    };

    // Tab Switching
    const tabs = document.querySelectorAll('.material-tab');
    const tabContents = document.querySelectorAll('.material-tab-content');
    const activeLine = document.querySelector('.active-line');

    function switchTab(tabId) {
        tabs.forEach(tab => {
            if (tab.id === tabId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Current simple implementation for active-line (assumes 2 tabs)
        // If more tabs, need dynamic calculation or update CSS
        // CSS handles :nth-of-type(1).active / (2).active. 
        // We just need to ensure the correct tab has 'active' class.

        tabContents.forEach(content => {
            if (`#${content.id}` === document.getElementById(tabId).getAttribute('href')) {
                content.style.display = 'block';
                if (content.id === 'search') {
                    document.querySelector('.search-container').style.display = 'flex';
                } else if (content.id === 'playlists') {
                    // Load playlists when tab is activated
                    updatePlaylists();
                }
            } else {
                content.style.display = 'none';
            }
        });
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const bottomDraw = document.querySelector('.bottom-draw');
            const isActive = tab.classList.contains('active');
            const isOpen = bottomDraw.hasAttribute('open');

            if (isActive && isOpen) {
                // If active and open, close it
                bottomDraw.removeAttribute('open');
            } else {
                // Otherwise, switch to it and open drawer
                switchTab(e.target.id);
                if (!isOpen) {
                    bottomDraw.setAttribute('open', '');
                }
            }
        });
    });

    // Default to queue
    switchTab('tab-queue');


    // Search Logic
    const searchInput = $('#search-input');
    const searchButton = $('#search-button');
    const searchResults = $('#search-results');

    async function doSearch() {
        const query = searchInput.value.trim();
        if (!query) return;

        searchResults.innerHTML = '<div style="text-align:center; padding: 20px;">Searching...</div>';

        try {
            const response = await fetch(`${getPrefix()}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });

            if (response.status === 200) {
                const data = await response.json();
                renderSearchResults(data);
            } else {
                searchResults.innerHTML = '<div style="text-align:center; padding: 20px;">Error searching</div>';
            }
        } catch (e) {
            console.error(e);
            searchResults.innerHTML = '<div style="text-align:center; padding: 20px;">Network error</div>';
        }
    }

    function renderSearchResults(data) {
        searchResults.innerHTML = '';
        const template = $('#search-result-template');

        let items = [];

        // Helper to find items recursively or known paths
        try {
            // Tabbed search results
            const sectionList = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
            if (sectionList) {
                // Find all shelves
                sectionList.forEach(section => {
                    const shelf = section.musicShelfRenderer;
                    if (shelf) {
                        items.push(...shelf.contents);
                    }
                });
            }
        } catch (e) {
            console.warn('Error parsing search results', e);
        }

        if (items.length === 0) {
            searchResults.innerHTML = '<div style="text-align:center; padding: 20px;">No results found</div>';
            return;
        }

        items.forEach(item => {
            const renderer = item.musicResponsiveListItemRenderer;
            if (!renderer) return;

            // 1. Filter out Profiles/Artists
            const subtitleRuns = renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
            const subtitle = subtitleRuns.map(r => r.text).join('');

            if (subtitle === 'Artist' || subtitle === 'Profile') return;

            // 2. Extract Data
            const clone = template.content.cloneNode(true);

            // Title
            const title = renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'Unknown';
            clone.querySelector('.search-result-title').innerText = title;

            // Artist / Subtitle
            clone.querySelector('.search-result-artist').innerText = subtitle;

            // Thumb
            const thumbs = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
            const thumbUrl = thumbs ? thumbs[thumbs.length - 1].url : '';
            clone.querySelector('.search-result-thumb').src = thumbUrl;

            // 3. Robust Video ID extraction
            let videoId = null;

            // Overlay
            const overlayPlayBtn = renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer;
            if (overlayPlayBtn?.playNavigationEndpoint?.watchEndpoint?.videoId) {
                videoId = overlayPlayBtn.playNavigationEndpoint.watchEndpoint.videoId;
            }

            // Menu
            if (!videoId && renderer.menu?.menuRenderer?.topLevelButtons) {
                const playBtn = renderer.menu.menuRenderer.topLevelButtons.find(btn =>
                    btn.buttonRenderer?.icon?.iconType === 'MUSIC_SHUFFLE' ||
                    btn.buttonRenderer?.icon?.iconType === 'PLAY_ARROW'
                );
                if (playBtn?.buttonRenderer?.command?.watchEndpoint?.videoId) {
                    videoId = playBtn.buttonRenderer.command.watchEndpoint.videoId;
                }
            }

            // PlaylistItemData
            if (!videoId && renderer.playlistItemData?.videoId) {
                videoId = renderer.playlistItemData.videoId;
            }

            // Click Navigation
            if (!videoId && renderer.navigationEndpoint?.watchEndpoint?.videoId) {
                videoId = renderer.navigationEndpoint.watchEndpoint.videoId;
            }


            const btnPlay = clone.querySelector('.search-item-play');
            const btnNext = clone.querySelector('.search-item-next');
            const btnAdd = clone.querySelector('.search-item-add');

            if (videoId) {
                // Play Now: Clear Queue -> Add -> Play
                btnPlay.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await sendCommand('play-now', { videoId }, 'POST');
                });

                // Play Next: Add after current
                btnNext.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await sendCommand('queue', { videoId, insertPosition: 'INSERT_AFTER_CURRENT_VIDEO' }, 'POST');
                    // Feedback usually handled by UI update
                });

                // Add to Queue: Add to end
                btnAdd.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await sendCommand('queue', { videoId, insertPosition: 'INSERT_AT_END' }, 'POST');
                });

                // Row click default -> Play Now
                clone.querySelector('.search-result-item').addEventListener('click', () => {
                    btnPlay.click();
                });

            } else {
                btnPlay.disabled = true;
                btnNext.disabled = true;
                btnAdd.disabled = true;
                btnPlay.style.opacity = '0.5';
                btnNext.style.opacity = '0.5';
                btnAdd.style.opacity = '0.5';
            }

            searchResults.appendChild(clone);
        });

    }

    searchButton.addEventListener('click', doSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doSearch();
    });

    // Initialize Welcome State
    displayState({ song: null });
    initWS();
});
