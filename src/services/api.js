// 🌟 切换为 Cloudflare 相对路径，让 CF 在后台帮你做反向代理加速
export const API_BASE_URL = '/api';

// --- 登录相关 ---
export async function getQRKey() {
    const res = await fetch(`${API_BASE_URL}/login/qr/key?timestamp=${Date.now()}`);
    return await res.json();
}

export async function createQRCode(key) {
    const res = await fetch(`${API_BASE_URL}/login/qr/create?key=${key}&qrimg=true&timestamp=${Date.now()}`);
    return await res.json();
}

export async function checkQRStatus(key) {
    const res = await fetch(`${API_BASE_URL}/login/qr/check?key=${key}&timestamp=${Date.now()}`);
    return await res.json();
}

// --- 用户数据相关 ---
export async function getUserAccount(cookieParam) {
    const res = await fetch(`${API_BASE_URL}/user/account?timestamp=${Date.now()}&cookie=${cookieParam}`);
    return await res.json();
}

export async function getUserPlaylists(uid, cookieParam) {
    const res = await fetch(`${API_BASE_URL}/user/playlist?uid=${uid}&timestamp=${Date.now()}&cookie=${cookieParam}`);
    return await res.json();
}

// --- 音乐获取相关 ---
export async function getPlaylistSongs(playlistId, cookieParam) {
    // 🌟 limit=1000：后台静默拉取你的全量歌单
    const res = await fetch(`${API_BASE_URL}/playlist/track/all?id=${playlistId}&limit=1000&timestamp=${Date.now()}&cookie=${cookieParam}`);
    return await res.json();
}

export async function getSongUrl(songId, cookieParam) {
    const res = await fetch(`${API_BASE_URL}/song/url/v1?id=${songId}&level=standard&cookie=${cookieParam}`);
    return await res.json();
}

// 🌟 获取歌曲歌词
export async function getSongLyric(songId, cookieParam) {
    const res = await fetch(`${API_BASE_URL}/lyric?id=${songId}&timestamp=${Date.now()}&cookie=${cookieParam}`);
    return await res.json();
}

// --- 用户操作相关 ---
// 🌟 向网易云官方同步数据，把歌曲添加到指定歌单
// op: 'add' 增加, 'del' 删除; pid: 歌单ID; trackId: 歌曲ID
export async function updatePlaylistTrack(op, pid, trackId, cookieParam) {
    const res = await fetch(`${API_BASE_URL}/playlist/tracks?op=${op}&pid=${pid}&tracks=${trackId}&timestamp=${Date.now()}&cookie=${cookieParam}`);
    return await res.json();
}