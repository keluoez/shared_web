// P2P音乐共享系统 - 前端JavaScript实现

// 全局变量
let nodeId = null; // 当前节点ID
let ws = null; // WebSocket连接
let peerConnections = new Map(); // WebRTC连接映射
let activeDataChannels = new Map(); // 活动的数据通道映射
let sharedFiles = new Map(); // 已共享的文件映射
let activeDownloads = new Map(); // 正在进行的下载映射
let completedDownloads = new Map(); // 已完成的下载映射
let fileInput = document.getElementById('file-input');
let fileDropArea = document.getElementById('file-drop-area');
let searchInput = document.getElementById('search-input');
let searchBtn = document.getElementById('search-btn');
let clearSearchBtn = document.getElementById('clear-search-btn');
let connectionStatus = document.getElementById('connection-status');
let notification = document.getElementById('notification');
let notificationTitle = document.getElementById('notification-title');
let notificationMessage = document.getElementById('notification-message');
let notificationIcon = document.getElementById('notification-icon');
let notificationClose = document.getElementById('notification-close');
let themeToggle = document.getElementById('theme-toggle');

// 初始化函数
function init() {
    // 生成节点ID
    generateNodeId();
    
    // 尝试连接WebSocket服务器
    connectWebSocket();
    
    // 绑定事件监听器
    bindEventListeners();
    
    // 模拟数据（用于演示）
    loadAllMusicData();
    
    // 绑定刷新所有音乐事件
    document.getElementById('refresh-all-music').addEventListener('click', () => {
        showNotification('刷新音乐列表', '正在更新所有共享音乐...', 'info');
        // 模拟刷新延迟
        setTimeout(() => {
            loadAllMusicData();
            showNotification('刷新成功', '音乐列表已更新', 'success');
        }, 500);
    });
}

// 生成节点ID
function generateNodeId() {
    nodeId = 'node_' + crypto.randomUUID();
    document.getElementById('node-id').textContent = nodeId;
}

// 连接WebSocket服务器
function connectWebSocket() {
    try {
        // 连接到真实的后端服务器
        const wsUrl = 'ws://' + window.location.hostname + ':8000/ws/' + nodeId;
        ws = new WebSocket(wsUrl);
        
        ws.onopen = onWebSocketOpen;
        ws.onmessage = onWebSocketMessage;
        ws.onclose = onWebSocketClose;
        ws.onerror = onWebSocketError;
        
        // 更新连接状态
        updateConnectionStatus('连接中...', 'yellow');
    } catch (error) {
        console.error('WebSocket连接失败:', error);
        updateConnectionStatus('连接错误', 'red');
        showNotification('连接错误', '无法连接到服务器', 'error');
        
        // 降级到模拟连接
        console.log('降级到模拟连接...');
        simulateWebSocketConnection();
    }
}

// 模拟WebSocket连接
function simulateWebSocketConnection() {
    // 更新连接状态
    updateConnectionStatus('连接中...', 'yellow');
    
    // 模拟连接延迟
    setTimeout(() => {
        updateConnectionStatus('已连接', 'green');
        showNotification('成功', '已成功连接到P2P网络', 'success');
    }, 1500);
}

// WebSocket事件处理函数（实际环境使用）
function onWebSocketOpen() {
    console.log('WebSocket连接已建立');
    updateConnectionStatus('已连接', 'green');
    showNotification('成功', '已成功连接到P2P网络', 'success');
}

function onWebSocketMessage(event) {
    const data = JSON.parse(event.data);
    console.log('收到消息:', data);
    
    // 根据消息类型处理不同的事件
    switch (data.type) {
        case 'search_results':
            handleSearchResults(data.results);
            break;
        case 'file_shared':
            handleFileShared(data.file);
            break;
        case 'peer_connected':
            handlePeerConnected(data);
            break;
        case 'offer':
            handleOffer(data);
            break;
        case 'answer':
            handleAnswer(data);
            break;
        case 'ice_candidate':
            handleIceCandidate(data);
            break;
        case 'node_list':
            handleNodeList(data.nodes);
            break;
        case 'node_status':
            handleNodeStatus(data);
            break;
        default:
            console.log('未知消息类型:', data.type);
    }
}

// 处理节点列表更新
function handleNodeList(nodes) {
    console.log('收到节点列表更新:', nodes);
    // 节点列表变化时实时刷新音乐列表
    loadAllMusicData();
}

// 处理文件共享消息
function handleFileShared(file) {
    console.log('收到文件共享消息:', file);
    // 文件共享时，实时更新音乐列表
    loadAllMusicData();
    // 显示通知
    showNotification('文件共享', `新文件已共享: ${file.name}`, 'info');
}

// 处理节点连接消息
function handlePeerConnected(data) {
    console.log('收到节点连接消息:', data);
    // 节点连接时，不自动刷新音乐列表
}

// 处理节点状态变化
function handleNodeStatus(data) {
    console.log('节点状态变化:', data.node_id, data.status);
    // 节点状态变化时，不要清空音乐列表
    // 只有在节点断开且该节点是唯一拥有某些文件的来源时，才需要更新列表
    if (data.status === 'disconnected') {
        // 延迟更新，让服务器有时间处理节点断开逻辑
        setTimeout(() => {
            loadAllMusicData();
        }, 500);
    }
}

function onWebSocketClose() {
    console.log('WebSocket连接已关闭');
    updateConnectionStatus('未连接', 'red');
    showNotification('连接断开', '与服务器的连接已断开', 'error');
    
    // 尝试重连
    setTimeout(() => {
        connectWebSocket();
    }, 3000);
}

function onWebSocketError(error) {
    console.error('WebSocket错误:', error);
    updateConnectionStatus('连接错误', 'red');
    showNotification('连接错误', '无法连接到服务器', 'error');
}

// 处理WebRTC offer消息
function handleOffer(data) {
    console.log('收到offer:', data);
    
    const { source_node_id, offer } = data;
    
    // 创建WebRTC连接
    createPeerConnection(source_node_id, true) // 标记为接收方
        .then(async (peerConnection) => {
            try {
                // 设置远程描述
                await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                
                // 创建answer
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                
                // 发送answer回源节点
                if (ws && ws.readyState === WebSocket.OPEN) {
                    const answerMessage = {
                        type: 'answer',
                        target_node_id: source_node_id,
                        answer: peerConnection.localDescription
                    };
                    
                    ws.send(JSON.stringify(answerMessage));
                }
            } catch (error) {
                console.error('处理offer失败:', error);
                showNotification('连接失败', '无法处理来自其他节点的连接请求', 'error');
            }
        })
        .catch(error => {
            console.error('创建连接失败:', error);
        });
}

// 处理WebRTC answer消息
function handleAnswer(data) {
    console.log('收到answer:', data);
    
    const { source_node_id, answer } = data;
    
    // 查找对应的peer connection
    const peerConnection = peerConnections.get(source_node_id);
    
    if (peerConnection) {
        // 设置远程描述
        peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
            .then(() => {
                console.log('远程描述已设置');
            })
            .catch(error => {
                console.error('设置远程描述失败:', error);
                showNotification('连接失败', '无法完成与其他节点的连接', 'error');
            });
    } else {
        console.error('找不到对应的peer connection:', source_node_id);
    }
}

// 处理ICE候选消息
function handleIceCandidate(data) {
    console.log('收到ICE候选:', data);
    
    const { source_node_id, candidate } = data;
    
    // 查找对应的peer connection
    const peerConnection = peerConnections.get(source_node_id);
    
    if (peerConnection && candidate) {
        // 添加ICE候选
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .then(() => {
                console.log('ICE候选已添加');
            })
            .catch(error => {
                console.error('添加ICE候选失败:', error);
            });
    }
}

// 绑定事件监听器
function bindEventListeners() {
    // 文件上传相关
    fileDropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelection);
    
    // 拖放功能
    fileDropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileDropArea.classList.add('border-primary');
    });
    
    fileDropArea.addEventListener('dragleave', () => {
        fileDropArea.classList.remove('border-primary');
    });
    
    fileDropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileDropArea.classList.remove('border-primary');
        
        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });
    
    // 搜索相关
    searchBtn.addEventListener('click', performSearch);
    clearSearchBtn.addEventListener('click', clearSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    
    // 通知相关
    notificationClose.addEventListener('click', hideNotification);
    
    // 主题切换
    themeToggle.addEventListener('click', toggleTheme);
}

// 处理文件选择
function handleFileSelection(event) {
    if (event.target.files.length > 0) {
        handleFiles(event.target.files);
    }
}

// 处理文件
async function handleFiles(files) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // 检查文件类型
        if (!file.type.startsWith('audio/') && !['.mp3', '.wav', '.flac', '.ogg', '.aac'].some(ext => file.name.toLowerCase().endsWith(ext))) {
            showNotification('不支持的文件类型', `文件 ${file.name} 不是支持的音频格式`, 'error');
            continue;
        }
        
        try {
            // 计算文件哈希值
            const fileHash = await calculateFileHash(file);
            
            // 创建文件信息
            const fileInfo = {
                id: fileHash,
                name: file.name,
                size: formatFileSize(file.size),
                actualSize: file.size,
                type: file.type,
                lastModified: new Date(file.lastModified).toLocaleDateString(),
                nodeId: nodeId
            };
            
            // 添加到已共享文件列表
            sharedFiles.set(fileHash, fileInfo);
            
            // 在界面上显示文件
            addSharedFileToUI(fileInfo);
            
            // 发送文件信息到服务器
            sendFileInfoToServer(fileInfo);
            
            showNotification('共享成功', `文件 ${file.name} 已成功共享`, 'success');
        } catch (error) {
            console.error('处理文件时出错:', error);
            showNotification('共享失败', `无法共享文件 ${file.name}`, 'error');
        }
    }
}

// 计算文件哈希值
async function calculateFileHash(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (event) => {
            try {
                const arrayBuffer = event.target.result;
                const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                resolve(hashHex);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('读取文件时出错'));
        reader.readAsArrayBuffer(file);
    });
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 执行搜索
function performSearch() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    
    if (!searchTerm) {
        showNotification('搜索提示', '请输入搜索关键词', 'info');
        return;
    }
    
    // 尝试通过WebSocket发送真实的搜索请求
    if (ws && ws.readyState === WebSocket.OPEN) {
        const searchRequest = {
            type: 'search',
            query: searchTerm
        };
        
        ws.send(JSON.stringify(searchRequest));
        showNotification('搜索中', `正在搜索包含 "${searchTerm}" 的音乐...`, 'info');
    } else {
        // 如果WebSocket连接不可用，降级到模拟搜索
        showNotification('离线模式', '使用模拟数据进行搜索', 'warning');
        simulateSearchResults(searchTerm);
    }
}

// 模拟搜索结果
function simulateSearchResults(searchTerm) {
    const searchResultsContainer = document.getElementById('search-results');
    const resultsContainer = document.getElementById('results-container');
    const noResults = document.getElementById('no-results');
    
    // 清空之前的结果
    resultsContainer.innerHTML = '';
    
    // 显示搜索结果区域
    searchResultsContainer.classList.remove('hidden');
    
    // 模拟搜索延迟
    setTimeout(() => {
        // 模拟匹配结果
        const mockResults = mockMusicData.filter(file => 
            file.name.toLowerCase().includes(searchTerm) || 
            file.artist?.toLowerCase().includes(searchTerm)
        );
        
        if (mockResults.length > 0) {
            // 显示搜索结果
            noResults.classList.add('hidden');
            
            mockResults.forEach(file => {
                addFileToSearchResults(file);
            });
        } else {
            // 没有找到结果
            noResults.classList.remove('hidden');
        }
    }, 500);
}

// 清除搜索
function clearSearch() {
    searchInput.value = '';
    document.getElementById('search-results').classList.add('hidden');
}

// 处理搜索结果
function handleSearchResults(results) {
    const searchResultsContainer = document.getElementById('search-results');
    const resultsContainer = document.getElementById('results-container');
    const noResults = document.getElementById('no-results');
    
    // 清空之前的结果
    resultsContainer.innerHTML = '';
    
    // 显示搜索结果区域
    searchResultsContainer.classList.remove('hidden');
    
    if (results.length > 0) {
        // 显示搜索结果
        noResults.classList.add('hidden');
        
        results.forEach(file => {
            addFileToSearchResults(file);
        });
    } else {
        // 没有找到结果
        noResults.classList.remove('hidden');
    }
}

// 添加文件到搜索结果
function addFileToSearchResults(file) {
    const resultsContainer = document.getElementById('results-container');
    
    // 创建音乐卡片
    const card = document.createElement('div');
    card.className = 'bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 music-card';
    
    // 生成随机的专辑封面颜色
    const coverColors = ['#6366F1', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B'];
    const randomColor = coverColors[Math.floor(Math.random() * coverColors.length)];
    
    card.innerHTML = `
        <div class="relative" style="background-color: ${randomColor}">
            <div class="h-48 flex items-center justify-center">
                <i class="fa fa-music text-white text-5xl opacity-70"></i>
            </div>
            <div class="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center play-icon opacity-0 transition-opacity duration-300 transform scale-90">
                <button class="download-btn bg-white text-primary rounded-full p-3 shadow-lg hover:bg-gray-100 transition-colors" data-file-id="${file.id}">
                    <i class="fa fa-download"></i>
                </button>
            </div>
        </div>
        <div class="p-4">
            <h4 class="font-bold text-gray-900 truncate" title="${file.name}">${file.name}</h4>
            <p class="text-gray-500 text-sm mt-1">${file.artist || '未知艺术家'}</p>
            <div class="mt-3 flex justify-between items-center">
                <span class="text-xs text-gray-500">${file.size}</span>
                <span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">${file.sources} 个来源</span>
            </div>
        </div>
    `;
    
    // 添加下载按钮事件
    const downloadBtn = card.querySelector('.download-btn');
    downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadFile(file);
    });
    
    resultsContainer.appendChild(card);
}

// 下载文件
async function downloadFile(file) {
    // 显示下载通知
    showNotification('开始下载', `正在下载文件 ${file.name}...`, 'info');
    
    // 确保file对象有必要的属性
    if (!file || typeof file !== 'object') {
        console.error('无效的文件对象:', file);
        showNotification('下载失败', '无效的文件信息', 'error');
        return;
    }
    
    // 创建下载项
    const downloadId = 'download_' + crypto.randomUUID();
    const downloadItem = {
        id: downloadId,
        file: file,
        progress: 0,
        status: 'downloading'
    };
    
    // 添加到活跃下载列表
    activeDownloads.set(downloadId, downloadItem);
    
    // 在界面上显示下载项
    addDownloadToUI(downloadItem);
    
    // 如果file对象没有node_ids属性，为了演示目的，使用模拟节点
    let node_ids = file.node_ids || file.sources ? Array(file.sources).fill('mock_node_' + Math.random().toString(36).substr(2, 9)) : [];
    
    try {
        // 首先尝试P2P下载
        if (node_ids && node_ids.length > 0) {
            // 尝试从第一个可用节点下载
            const targetNodeId = node_ids[0];
            
            // 显示连接状态
            showNotification('P2P连接', `正在连接到节点 ${targetNodeId.substring(0, 8)}...`, 'info');
            
            // 创建WebRTC连接，作为接收方
            const peerConnection = await createPeerConnection(targetNodeId, true);
            
            // 创建数据通道用于文件传输
            const dataChannel = peerConnection.createDataChannel('fileTransfer');
            
            // 保存数据通道
            activeDataChannels.set(targetNodeId, dataChannel);
            
            // 数据通道事件处理
            dataChannel.onopen = () => {
                console.log('数据通道已打开，请求文件:', file.name);
                showNotification('连接成功', '数据通道已成功建立', 'success');
                // 发送文件请求
                dataChannel.send(JSON.stringify({
                    type: 'request_file',
                    file_id: file.id
                }));
            };
            
            dataChannel.onmessage = (event) => {
                console.log('收到数据通道消息:', event.data);
                
                try {
                    // 尝试解析为JSON对象
                    const message = JSON.parse(event.data);
                    
                    if (message.type === 'file_data') {
                        // 更新下载进度为100%表示完成
                        downloadItem.progress = 100;
                        downloadItem.status = 'completed';
                        
                        // 将下载项移到已完成列表
                        completedDownloads.set(downloadId, downloadItem);
                        activeDownloads.delete(downloadId);
                        
                        // 创建一个Blob对象作为文件内容
                        const fileExtension = file.name.split('.').pop() || 'mp3';
                        const mimeType = getMimeType(fileExtension);
                        
                        // 创建适当大小的模拟音频文件内容
                        const audioContent = createSimpleAudioFile(mimeType);
                        
                        // 根据MIME类型创建适当的二进制数据
                        let blob;
                        if (mimeType === 'audio/mpeg' || mimeType === 'audio/wav' || mimeType === 'audio/flac') {
                            // 对于二进制格式，使用ArrayBuffer
                            const buffer = new ArrayBuffer(audioContent.length);
                            const view = new Uint8Array(buffer);
                            for (let i = 0; i < audioContent.length; i++) {
                                view[i] = audioContent.charCodeAt(i);
                            }
                            blob = new Blob([buffer], { type: mimeType });
                        } else {
                            // 对于其他格式，使用文本内容
                            blob = new Blob([audioContent], { type: mimeType });
                        }
                        
                        // 创建下载链接
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = file.name;
                        
                        // 触发下载
                        document.body.appendChild(a);
                        a.click();
                        
                        // 清理
                        document.body.removeChild(a);
                        setTimeout(() => {
                            URL.revokeObjectURL(url);
                        }, 100);
                        
                        // 更新界面
                        updateDownloadProgress(downloadItem);
                        showNotification('下载完成', `文件 ${file.name} 已下载完成`, 'success');
                        
                        // 添加到已完成下载列表
                        addCompletedDownloadToUI(downloadItem);
                        
                        // 关闭数据通道
                        dataChannel.close();
                        
                        // 关闭WebRTC连接
                        if (peerConnection.connectionState !== 'closed') {
                            peerConnection.close();
                        }
                    } else if (message.type === 'file_error') {
                        showNotification('下载失败', `下载 ${file.name} 失败: ${message.message || '未知错误'}`, 'error');
                        activeDownloads.delete(downloadId);
                        
                        // 关闭连接
                        if (peerConnection.connectionState !== 'closed') {
                            peerConnection.close();
                        }
                        if (dataChannel.readyState === 'open') {
                            dataChannel.close();
                        }
                    } else if (message.type === 'download_progress') {
                        // 更新下载进度
                        downloadItem.progress = message.progress;
                        updateDownloadProgress(downloadItem);
                    }
                } catch (error) {
                    console.error('解析数据通道消息错误:', error);
                    // 尝试处理二进制数据
                    try {
                        // 在实际应用中，这里应该处理二进制文件数据
                        console.log('接收到二进制文件数据');
                        
                        // 模拟下载完成
                        downloadItem.progress = 100;
                        downloadItem.status = 'completed';
                        
                        // 将下载项移到已完成列表
                        completedDownloads.set(downloadId, downloadItem);
                        activeDownloads.delete(downloadId);
                        
                        // 创建模拟文件并触发下载
                        const fileExtension = file.name.split('.').pop() || 'mp3';
                        const mimeType = getMimeType(fileExtension);
                        const audioContent = createSimpleAudioFile(mimeType);
                        
                        // 创建Blob对象
                        let blob;
                        if (event.data instanceof Blob) {
                            blob = event.data;
                        } else {
                            // 创建适当的二进制数据
                            const buffer = new ArrayBuffer(audioContent.length);
                            const view = new Uint8Array(buffer);
                            for (let i = 0; i < audioContent.length; i++) {
                                view[i] = audioContent.charCodeAt(i);
                            }
                            blob = new Blob([buffer], { type: mimeType });
                        }
                        
                        // 创建下载链接
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = file.name;
                        
                        // 触发下载
                        document.body.appendChild(a);
                        a.click();
                        
                        // 清理
                        document.body.removeChild(a);
                        setTimeout(() => {
                            URL.revokeObjectURL(url);
                        }, 100);
                        
                        // 更新界面
                        updateDownloadProgress(downloadItem);
                        showNotification('下载完成', `文件 ${file.name} 已下载完成`, 'success');
                        
                        // 添加到已完成下载列表
                        addCompletedDownloadToUI(downloadItem);
                        
                        // 关闭连接
                        if (peerConnection.connectionState !== 'closed') {
                            peerConnection.close();
                        }
                        if (dataChannel.readyState === 'open') {
                            dataChannel.close();
                        }
                    } catch (binaryError) {
                        console.error('处理二进制数据错误:', binaryError);
                        showNotification('下载错误', `下载 ${file.name} 时发生数据格式错误`, 'error');
                        activeDownloads.delete(downloadId);
                    }
                }
            };
            
            dataChannel.onclose = () => {
                console.log('数据通道已关闭');
                activeDataChannels.delete(targetNodeId);
            };
            
            dataChannel.onerror = (error) => {
                console.error('数据通道错误:', error);
                showNotification('下载错误', `下载 ${file.name} 时发生数据通道错误`, 'error');
                activeDownloads.delete(downloadId);
            };
            
            // 创建并发送offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            // 发送offer到服务器
            if (ws && ws.readyState === WebSocket.OPEN) {
                const offerMessage = {
                    type: 'offer',
                    target_node_id: targetNodeId,
                    offer: peerConnection.localDescription
                };
                
                ws.send(JSON.stringify(offerMessage));
            } else {
                showNotification('连接错误', 'WebSocket连接已关闭，无法发起P2P连接', 'error');
                activeDownloads.delete(downloadId);
                return;
            }
            
            // 设置一个超时，如果在一定时间内没有收到响应，就自动切换到模拟下载
            setTimeout(() => {
                if (activeDownloads.has(downloadId) && downloadItem.progress < 100) {
                    console.log('P2P下载超时，切换到模拟下载');
                    showNotification('切换下载方式', `正在使用模拟方式下载 ${file.name}`, 'info');
                    
                    // 关闭P2P连接和数据通道
                    if (peerConnection.connectionState !== 'closed') {
                        peerConnection.close();
                    }
                    if (dataChannel.readyState === 'open') {
                        dataChannel.close();
                    }
                    
                    // 使用模拟下载进度更新
                    simulateDownloadProgress(downloadItem, () => {
                        // 下载完成后的回调
                        try {
                            // 创建适当大小的模拟音频文件内容
                            const fileExtension = file.name.split('.').pop() || 'mp3';
                            const mimeType = getMimeType(fileExtension);
                            const audioContent = createSimpleAudioFile(mimeType);
                            
                            // 根据MIME类型创建适当的二进制数据
                            let blob;
                            if (mimeType === 'audio/mpeg' || mimeType === 'audio/wav' || mimeType === 'audio/flac') {
                                // 对于二进制格式，使用ArrayBuffer
                                const buffer = new ArrayBuffer(audioContent.length);
                                const view = new Uint8Array(buffer);
                                for (let i = 0; i < audioContent.length; i++) {
                                    view[i] = audioContent.charCodeAt(i);
                                }
                                blob = new Blob([buffer], { type: mimeType });
                            } else {
                                // 对于其他格式，使用文本内容
                                blob = new Blob([audioContent], { type: mimeType });
                            }
                            
                            // 创建下载链接
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = file.name;
                            
                            // 触发下载
                            document.body.appendChild(a);
                            a.click();
                            
                            // 清理
                            document.body.removeChild(a);
                            setTimeout(() => {
                                URL.revokeObjectURL(url);
                            }, 100);
                            
                            // 更新下载状态
                            downloadItem.progress = 100;
                            downloadItem.status = 'completed';
                            
                            // 将下载项移到已完成列表
                            completedDownloads.set(downloadId, downloadItem);
                            activeDownloads.delete(downloadId);
                            
                            // 更新界面
                            updateDownloadProgress(downloadItem);
                            showNotification('下载完成', `文件 ${file.name} 已下载完成`, 'success');
                            
                            // 添加到已完成下载列表
                            addCompletedDownloadToUI(downloadItem);
                        } catch (error) {
                            console.error('创建下载文件失败:', error);
                            showNotification('下载失败', `无法创建下载文件: ${error.message}`, 'error');
                            activeDownloads.delete(downloadId);
                        }
                    });
                }
            }, 15000); // 15秒超时，给P2P连接足够时间
        } else {
            // 如果没有可用节点，直接使用模拟下载
            showNotification('使用模拟下载', `正在使用模拟方式下载 ${file.name}`, 'info');
            
            // 使用模拟下载进度更新
            simulateDownloadProgress(downloadItem, () => {
                // 下载完成后的回调
                try {
                    // 创建适当大小的模拟音频文件内容
                    const fileExtension = file.name.split('.').pop() || 'mp3';
                    const mimeType = getMimeType(fileExtension);
                    const audioContent = createSimpleAudioFile(mimeType);
                    
                    // 根据MIME类型创建适当的二进制数据
                    let blob;
                    if (mimeType === 'audio/mpeg' || mimeType === 'audio/wav' || mimeType === 'audio/flac') {
                        // 对于二进制格式，使用ArrayBuffer
                        const buffer = new ArrayBuffer(audioContent.length);
                        const view = new Uint8Array(buffer);
                        for (let i = 0; i < audioContent.length; i++) {
                            view[i] = audioContent.charCodeAt(i);
                        }
                        blob = new Blob([buffer], { type: mimeType });
                    } else {
                        // 对于其他格式，使用文本内容
                        blob = new Blob([audioContent], { type: mimeType });
                    }
                    
                    // 创建下载链接
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = file.name;
                    
                    // 触发下载
                    document.body.appendChild(a);
                    a.click();
                    
                    // 清理
                    document.body.removeChild(a);
                    setTimeout(() => {
                        URL.revokeObjectURL(url);
                    }, 100);
                    
                    // 更新下载状态
                    downloadItem.progress = 100;
                    downloadItem.status = 'completed';
                    
                    // 将下载项移到已完成列表
                    completedDownloads.set(downloadId, downloadItem);
                    activeDownloads.delete(downloadId);
                    
                    // 更新界面
                    updateDownloadProgress(downloadItem);
                    showNotification('下载完成', `文件 ${file.name} 已下载完成`, 'success');
                    
                    // 添加到已完成下载列表
                    addCompletedDownloadToUI(downloadItem);
                } catch (error) {
                    console.error('创建下载文件失败:', error);
                    showNotification('下载失败', `无法创建下载文件: ${error.message}`, 'error');
                    activeDownloads.delete(downloadId);
                }
            });
        }
    } catch (error) {
        console.error('文件下载失败:', error);
        showNotification('下载失败', '无法下载文件，请稍后再试', 'error');
        // 确保移除活跃下载
        if (downloadId && activeDownloads.has(downloadId)) {
            activeDownloads.delete(downloadId);
        }
    }
}

// 模拟下载进度
function simulateDownloadProgress(downloadItem, onComplete) {
    // 模拟下载进度
    const simulateProgress = () => {
        if (!activeDownloads.has(downloadItem.id)) return;
        
        const progress = activeDownloads.get(downloadItem.id).progress + Math.random() * 10;
        
        if (progress >= 100) {
            // 下载完成
            onComplete();
        } else {
            // 更新进度
            activeDownloads.get(downloadItem.id).progress = progress;
            updateDownloadProgress(downloadItem);
            
            // 继续模拟进度
            setTimeout(simulateProgress, 300);
        }
    };
    
    // 开始模拟
    setTimeout(simulateProgress, 300);
}

// 创建简单的音频文件内容
function createSimpleAudioFile(mimeType) {
    // 生成更大的模拟音频内容，确保文件大小合理
    if (mimeType === 'audio/mpeg') {
        // 创建一个更大的MP3文件模拟内容（约3MB）
        let mp3Content = 'ID3\x03\x00\x00\x00\x00\x0F\x00\x00TIT2\x00\x00\x00\x0C\x00\x00\x00Sample Audio\x00TPE1\x00\x00\x00\x06\x00\x00\x00Demo\x00';
        
        // 添加更多内容使文件更大
        const bufferSize = 3 * 1024 * 1024; // 约3MB
        const repeatCount = Math.floor(bufferSize / mp3Content.length);
        
        let fullContent = mp3Content;
        for (let i = 0; i < repeatCount; i++) {
            fullContent += mp3Content;
        }
        
        // 截取到所需大小
        return fullContent.substring(0, bufferSize);
    } else if (mimeType === 'audio/wav') {
        // 创建一个更大的WAV文件模拟内容（约5MB）
        let wavHeader = 'RIFF\x1C\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xAC\x00\x00\x88\x58\x01\x00\x02\x00\x10\x00data\x04\x00\x00\x00';
        
        // 添加更多音频数据使文件更大
        const bufferSize = 5 * 1024 * 1024; // 约5MB
        const dataSize = bufferSize - wavHeader.length;
        
        // 创建一些音频数据（正弦波样本）
        let audioData = '';
        for (let i = 0; i < dataSize; i += 2) {
            // 简单的正弦波样本
            const sample = Math.sin(i / 100) * 32767;
            // 转换为16位有符号整数
            const bytes = String.fromCharCode(sample & 0xFF, (sample >> 8) & 0xFF);
            audioData += bytes;
        }
        
        return wavHeader + audioData;
    } else if (mimeType === 'audio/flac') {
        // 创建一个更大的FLAC文件模拟内容（约4MB）
        let flacHeader = 'fLaC'; // FLAC文件标记
        
        // 添加更多内容使文件更大
        const bufferSize = 4 * 1024 * 1024; // 约4MB
        const repeatCount = Math.floor((bufferSize - flacHeader.length) / 100);
        
        let fullContent = flacHeader;
        for (let i = 0; i < repeatCount; i++) {
            // 添加一些随机的模拟FLAC数据
            fullContent += String.fromCharCode(Math.floor(Math.random() * 256));
        }
        
        return fullContent;
    } else {
        // 默认返回更大的文本内容
        let defaultContent = '模拟音频文件内容';
        const bufferSize = 2 * 1024 * 1024; // 约2MB
        const repeatCount = Math.floor(bufferSize / defaultContent.length);
        
        let fullContent = defaultContent;
        for (let i = 0; i < repeatCount; i++) {
            fullContent += defaultContent;
        }
        
        return fullContent.substring(0, bufferSize);
    }
}

// 获取文件的MIME类型
function getMimeType(fileExtension) {
    const mimeTypes = {
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'flac': 'audio/flac',
        'ogg': 'audio/ogg',
        'm4a': 'audio/m4a'
    };
    return mimeTypes[fileExtension.toLowerCase()] || 'application/octet-stream';
}



// 创建WebRTC连接
async function createPeerConnection(targetNodeId, isReceiver = false) {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    };
    
    const peerConnection = new RTCPeerConnection(configuration);
    
    // 保存连接
    peerConnections.set(targetNodeId, peerConnection);
    
    // 作为接收方时，监听数据通道的创建
    if (isReceiver) {
        peerConnection.ondatachannel = (event) => {
            const dataChannel = event.channel;
            
            console.log('收到数据通道:', dataChannel.label);
            
            // 保存数据通道
            activeDataChannels.set(targetNodeId, dataChannel);
            
            // 设置数据通道事件处理
            dataChannel.onmessage = (e) => {
                try {
                    // 尝试解析为JSON对象
                    const message = JSON.parse(e.data);
                    
                    // 处理文件请求
                    if (message.type === 'request_file' && message.file_id) {
                        console.log('收到文件请求:', message.file_id);
                        
                        // 查找本地是否有该文件
                        const file = sharedFiles.get(message.file_id);
                        if (file) {
                            // 在实际应用中，这里应该读取本地文件并通过数据通道发送
                            // 由于是演示系统，我们模拟发送文件数据
                            console.log('找到文件，准备发送:', file.name);
                            
                            // 模拟文件发送延迟
                            setTimeout(() => {
                                // 发送文件数据
                                if (dataChannel.readyState === 'open') {
                                    dataChannel.send(JSON.stringify({
                                        type: 'file_data',
                                        file_id: message.file_id,
                                        file_name: file.name,
                                        file_size: file.actualSize,
                                        status: 'completed'
                                    }));
                                }
                            }, 1000);
                        } else {
                            console.error('未找到请求的文件:', message.file_id);
                            
                            if (dataChannel.readyState === 'open') {
                                dataChannel.send(JSON.stringify({
                                    type: 'file_error',
                                    file_id: message.file_id,
                                    message: '文件不存在'
                                }));
                            }
                        }
                    }
                } catch (error) {
                    // 如果不是JSON格式，可能是二进制数据
                    console.log('收到二进制数据，大小:', e.data.length);
                }
            };
            
            dataChannel.onopen = () => {
                console.log('数据通道已打开（接收方）');
            };
            
            dataChannel.onclose = () => {
                console.log('数据通道已关闭');
                activeDataChannels.delete(targetNodeId);
            };
            
            dataChannel.onerror = (error) => {
                console.error('数据通道错误:', error);
                activeDataChannels.delete(targetNodeId);
            };
        };
    }
    
    // 监听ICE候选者
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            // 发送ICE候选者到服务器
            const iceCandidateMessage = {
                type: 'ice_candidate',
                targetNodeId: targetNodeId,
                candidate: event.candidate
            };
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(iceCandidateMessage));
            }
        }
    };
    
    // 监听连接状态变化
    peerConnection.onconnectionstatechange = () => {
        console.log('连接状态变化:', peerConnection.connectionState);
        
        if (peerConnection.connectionState === 'connected') {
            showNotification('P2P连接已建立', `与节点 ${targetNodeId} 的连接已建立`, 'success');
        } else if (peerConnection.connectionState === 'disconnected' || 
                  peerConnection.connectionState === 'failed') {
            showNotification('P2P连接断开', `与节点 ${targetNodeId} 的连接已断开`, 'error');
            peerConnections.delete(targetNodeId);
            activeDataChannels.delete(targetNodeId);
        }
    };
    
    return peerConnection;
}

// 更新连接状态
function updateConnectionStatus(status, color) {
    const statusIndicator = connectionStatus.querySelector('span:first-child');
    const statusText = connectionStatus.querySelector('span:last-child');
    
    // 更新状态文本
    statusText.textContent = status;
    
    // 更新状态指示器颜色
    statusIndicator.className = 'w-2 h-2 rounded-full animate-pulse-slow';
    
    switch (color) {
        case 'green':
            statusIndicator.classList.add('bg-green-500');
            break;
        case 'yellow':
            statusIndicator.classList.add('bg-yellow-500');
            break;
        case 'red':
            statusIndicator.classList.add('bg-red-500');
            break;
        default:
            statusIndicator.classList.add('bg-gray-500');
    }
}

// 显示通知
function showNotification(title, message, type = 'info') {
    // 设置通知内容
    notificationTitle.textContent = title;
    notificationMessage.textContent = message;
    
    // 设置通知图标和颜色
    notificationIcon.className = '';
    
    switch (type) {
        case 'success':
            notificationIcon.classList.add('text-green-500');
            notificationIcon.innerHTML = '<i class="fa fa-check-circle"></i>';
            break;
        case 'error':
            notificationIcon.classList.add('text-red-500');
            notificationIcon.innerHTML = '<i class="fa fa-exclamation-circle"></i>';
            break;
        case 'warning':
            notificationIcon.classList.add('text-yellow-500');
            notificationIcon.innerHTML = '<i class="fa fa-exclamation-triangle"></i>';
            break;
        default:
            notificationIcon.classList.add('text-primary');
            notificationIcon.innerHTML = '<i class="fa fa-info-circle"></i>';
    }
    
    // 显示通知
    notification.classList.add('show');
    
    // 自动隐藏通知
    setTimeout(hideNotification, 5000);
}

// 隐藏通知
function hideNotification() {
    notification.classList.remove('show');
}

// 发送文件信息到服务器
function sendFileInfoToServer(fileInfo) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const fileShareMessage = {
            type: 'file_shared',
            file: fileInfo
        };
        
        ws.send(JSON.stringify(fileShareMessage));
        console.log('文件信息已发送到服务器:', fileInfo.name);
    } else {
        console.warn('WebSocket未连接，无法发送文件信息到服务器');
        // 在实际应用中，可能需要实现离线共享机制
    }
}

// 添加共享文件到界面
function addSharedFileToUI(fileInfo) {
    const sharedFilesList = document.getElementById('shared-files-list');
    const noSharedFiles = document.getElementById('no-shared-files');
    
    // 隐藏无文件提示
    noSharedFiles.classList.add('hidden');
    
    // 创建文件项
    const fileItem = document.createElement('div');
    fileItem.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200';
    fileItem.innerHTML = `
        <div class="flex items-center">
            <i class="fa fa-music text-primary mr-3"></i>
            <div>
                <p class="font-medium text-gray-900 truncate max-w-xs" title="${fileInfo.name}">${fileInfo.name}</p>
                <p class="text-xs text-gray-500">${fileInfo.size} · ${fileInfo.lastModified}</p>
            </div>
        </div>
        <button class="remove-shared-file text-red-500 hover:text-red-700 p-2" data-file-id="${fileInfo.id}">
            <i class="fa fa-trash"></i>
        </button>
    `;
    
    // 添加删除按钮事件
    const removeBtn = fileItem.querySelector('.remove-shared-file');
    removeBtn.addEventListener('click', () => {
        removeSharedFile(fileInfo.id);
        fileItem.remove();
        
        // 如果没有共享文件了，显示提示
        if (sharedFilesList.children.length === 0) {
            noSharedFiles.classList.remove('hidden');
        }
    });
    
    sharedFilesList.appendChild(fileItem);
}

// 移除共享文件
function removeSharedFile(fileId) {
    sharedFiles.delete(fileId);
    showNotification('已取消共享', '文件已从共享列表中移除', 'info');
    
    // 在实际环境中，这里应该通知服务器
}

// 添加下载项到界面
function addDownloadToUI(downloadItem) {
    const downloadsList = document.getElementById('downloads-list');
    const noActiveDownloads = document.getElementById('no-active-downloads');
    
    // 隐藏无下载提示
    noActiveDownloads.classList.add('hidden');
    
    // 创建下载项
    const downloadItemElement = document.createElement('div');
    downloadItemElement.className = 'p-3 bg-gray-50 rounded-lg border border-gray-200';
    downloadItemElement.id = `download-${downloadItem.id}`;
    downloadItemElement.innerHTML = `
        <div class="flex items-center justify-between mb-2">
            <div class="flex items-center">
                <i class="fa fa-download text-accent mr-3"></i>
                <p class="font-medium text-gray-900 truncate max-w-xs" title="${downloadItem.file.name}">${downloadItem.file.name}</p>
            </div>
            <div class="flex items-center space-x-2">
                <span class="text-xs text-gray-500 download-progress-text">0%</span>
                <button class="cancel-download text-red-500 hover:text-red-700 p-1" data-download-id="${downloadItem.id}">
                    <i class="fa fa-times"></i>
                </button>
            </div>
        </div>
        <div class="download-progress">
            <div class="download-progress-bar" style="width: 0%"></div>
        </div>
    `;
    
    // 添加取消下载按钮事件
    const cancelBtn = downloadItemElement.querySelector('.cancel-download');
    cancelBtn.addEventListener('click', () => {
        cancelDownload(downloadItem.id);
        downloadItemElement.remove();
        
        // 如果没有活跃下载了，显示提示
        if (downloadsList.children.length === 0) {
            noActiveDownloads.classList.remove('hidden');
        }
    });
    
    downloadsList.appendChild(downloadItemElement);
}

// 更新下载进度
function updateDownloadProgress(downloadItem) {
    const downloadItemElement = document.getElementById(`download-${downloadItem.id}`);
    
    if (!downloadItemElement) return;
    
    const progressBar = downloadItemElement.querySelector('.download-progress-bar');
    const progressText = downloadItemElement.querySelector('.download-progress-text');
    const cancelBtn = downloadItemElement.querySelector('.cancel-download');
    
    // 更新进度条
    progressBar.style.width = `${downloadItem.progress}%`;
    progressText.textContent = `${Math.round(downloadItem.progress)}%`;
    
    // 如果下载完成，隐藏取消按钮
    if (downloadItem.status === 'completed') {
        cancelBtn.style.display = 'none';
        progressText.textContent = '完成';
    }
}

// 取消下载
function cancelDownload(downloadId) {
    activeDownloads.delete(downloadId);
    showNotification('下载已取消', '文件下载已取消', 'info');
}

// 添加已完成下载到界面
function addCompletedDownloadToUI(downloadItem) {
    const completedList = document.getElementById('completed-list');
    const noCompletedDownloads = document.getElementById('no-completed-downloads');
    
    // 隐藏无下载提示
    noCompletedDownloads.classList.add('hidden');
    
    // 创建完成下载项
    const completedItem = document.createElement('div');
    completedItem.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200';
    completedItem.innerHTML = `
        <div class="flex items-center">
            <i class="fa fa-check-circle text-green-500 mr-3"></i>
            <div>
                <p class="font-medium text-gray-900 truncate max-w-xs" title="${downloadItem.file.name}">${downloadItem.file.name}</p>
                <p class="text-xs text-gray-500">${downloadItem.file.size}</p>
            </div>
        </div>
        <button class="play-downloaded-file text-primary hover:text-primary/80 p-2" data-download-id="${downloadItem.id}">
            <i class="fa fa-play"></i>
        </button>
    `;
    
    // 添加播放按钮事件
    const playBtn = completedItem.querySelector('.play-downloaded-file');
    playBtn.addEventListener('click', () => {
        // 在实际环境中，这里应该播放已下载的文件
        showNotification('播放文件', `正在播放 ${downloadItem.file.name}`, 'info');
    });
    
    completedList.appendChild(completedItem);
}

// 切换主题
function toggleTheme() {
    const icon = themeToggle.querySelector('i');
    
    if (icon.classList.contains('fa-moon-o')) {
        // 切换到暗黑模式
        icon.classList.remove('fa-moon-o');
        icon.classList.add('fa-sun-o');
        document.body.classList.add('dark-mode');
        showNotification('主题切换', '已切换到暗黑模式', 'info');
    } else {
        // 切换到明亮模式
        icon.classList.remove('fa-sun-o');
        icon.classList.add('fa-moon-o');
        document.body.classList.remove('dark-mode');
        showNotification('主题切换', '已切换到明亮模式', 'info');
    }
}

// 模拟音乐数据（用于演示）
const mockMusicData = [
    {
        id: 'mock_1',
        name: 'Shape of You',
        artist: 'Ed Sheeran',
        size: '4.5 MB',
        actualSize: 4718592,
        sources: 5
    },
    {
        id: 'mock_2',
        name: 'Blinding Lights',
        artist: 'The Weeknd',
        size: '3.8 MB',
        actualSize: 3981312,
        sources: 8
    },
    {
        id: 'mock_3',
        name: 'Dance Monkey',
        artist: 'Tones and I',
        size: '3.2 MB',
        actualSize: 3355443,
        sources: 4
    },
    {
        id: 'mock_4',
        name: 'Save Your Tears',
        artist: 'The Weeknd',
        size: '4.1 MB',
        actualSize: 4294967,
        sources: 6
    },
    {
        id: 'mock_5',
        name: 'Levitating',
        artist: 'Dua Lipa',
        size: '3.6 MB',
        actualSize: 3774873,
        sources: 7
    },
    {
        id: 'mock_6',
        name: 'Stay',
        artist: 'Justin Bieber, The Kid LAROI',
        size: '2.9 MB',
        actualSize: 3040870,
        sources: 9
    }
];



// 加载所有共享音乐
function loadAllMusicData() {
    const allMusicContainer = document.getElementById('all-music-container');
    const noAllMusic = document.getElementById('no-all-music');
    
    // 不要立即清空容器，避免用户看到空白列表
    // 尝试通过WebSocket从服务器获取所有音乐
    if (ws && ws.readyState === WebSocket.OPEN) {
        const request = {
            type: 'get_all_files'
        };
        
        ws.send(JSON.stringify(request));
        
        // 注册一次性的消息处理函数来处理响应
        const handleAllFilesResponse = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'all_files') {
                    // 现在才清空容器并显示新数据
                    allMusicContainer.innerHTML = '';
                    displayMusicFiles(data.files);
                    // 移除临时的消息监听器
                    ws.removeEventListener('message', handleAllFilesResponse);
                }
            } catch (error) {
                console.error('处理服务器响应时出错:', error);
                // 出错时不清空列表，保持现有数据
                showNotification('数据加载错误', '无法更新音乐列表', 'error');
            }
        };
        
        ws.addEventListener('message', handleAllFilesResponse);
        
        // 设置超时，但超时后不自动清空列表
        setTimeout(() => {
            ws.removeEventListener('message', handleAllFilesResponse);
            // 超时后保持现有列表，而不是清空
            showNotification('加载超时', '音乐列表更新超时，请稍后再试', 'warning');
        }, 5000);
    } else {
        // 如果WebSocket连接不可用，显示连接状态通知
        showNotification('连接状态', '正在尝试连接到服务器...', 'info');
        // 不自动清空列表，保持现有数据
    }
}

// 显示音乐文件列表
function displayMusicFiles(files) {
    const allMusicContainer = document.getElementById('all-music-container');
    const noAllMusic = document.getElementById('no-all-music');
    
    // 清空容器
    allMusicContainer.innerHTML = '';
    
    if (files && files.length > 0) {
        noAllMusic.classList.add('hidden');
        
        // 显示所有音乐
        files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 music-card';
            
            // 生成随机的专辑封面颜色
            const coverColors = ['#6366F1', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#EF4444', '#14B8A6'];
            const randomColor = coverColors[Math.floor(Math.random() * coverColors.length)];
            
            card.innerHTML = `
                <div class="relative" style="background-color: ${randomColor}">
                    <div class="h-48 flex items-center justify-center">
                        <i class="fa fa-music text-white text-5xl opacity-70"></i>
                    </div>
                    <div class="absolute right-3 bottom-3">
                        <button class="download-btn bg-white text-primary rounded-full p-3 shadow-lg hover:bg-gray-100 transition-colors" data-file-id="${file.id}">
                            <i class="fa fa-download"></i>
                        </button>
                    </div>
                </div>
                <div class="p-4">
                    <h4 class="font-bold text-gray-900 truncate" title="${file.name}">${file.name}</h4>
                    <p class="text-gray-500 text-sm mt-1">${file.artist || '未知艺术家'}</p>
                    <div class="mt-3 flex justify-between items-center">
                        <span class="text-xs text-gray-500">${file.size}</span>
                        <span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">${file.sources} 个来源</span>
                    </div>
                </div>
            `;
            
            // 添加下载按钮事件
            const downloadBtn = card.querySelector('.download-btn');
            downloadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                downloadFile(file);
            });
            
            allMusicContainer.appendChild(card);
        });
    } else {
        noAllMusic.classList.remove('hidden');
    }
}

// 页面加载完成后初始化
window.addEventListener('load', init);