from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from typing import Dict, Set, List, Optional
import uvicorn
import asyncio
import json
import uuid
import time
import logging
from datetime import datetime
import sys

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("P2P_Music_Server")

# 创建FastAPI应用
app = FastAPI(title="P2P音乐共享系统", description="基于WebRTC的点对点音乐共享平台")

# 挂载静态文件目录
app.mount("/static", StaticFiles(directory="static"), name="static")

# 数据模型（内存存储）
class NodeInfo:
    def __init__(self, node_id: str, websocket: WebSocket):
        self.node_id = node_id
        self.websocket = websocket
        self.connected_at = time.time()
        self.last_heartbeat = time.time()
        self.is_active = True

class FileInfo:
    def __init__(self, file_id: str, name: str, size: str, actual_size: int, file_type: str, node_id: str):
        self.file_id = file_id
        self.name = name
        self.size = size
        self.actual_size = actual_size
        self.type = file_type
        self.node_id = node_id
        self.shared_at = time.time()
        self.sources = 1  # 默认有一个来源

# 内存存储
nodes: Dict[str, NodeInfo] = {}  # node_id -> NodeInfo
files: Dict[str, FileInfo] = {}  # file_id -> FileInfo
node_files: Dict[str, Set[str]] = {}  # node_id -> set(file_ids)

# 心跳检测间隔（秒）
HEARTBEAT_INTERVAL = 30

# 根目录返回HTML文件
@app.get("/")
async def read_root(request: Request):
    with open("index.html", "r", encoding="utf-8") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content)

# WebSocket连接端点
@app.websocket("/ws/{node_id}")
async def websocket_endpoint(websocket: WebSocket, node_id: str):
    await websocket.accept()
    
    # 创建节点信息
    node_info = NodeInfo(node_id, websocket)
    nodes[node_id] = node_info
    node_files[node_id] = set()
    
    # 记录节点连接
    logger.info(f"节点 {node_id} 已连接")
    
    # 向所有其他节点广播新节点连接
    await broadcast_node_connection(node_id, "connected")
    
    # 发送当前节点列表给新节点
    await send_node_list(node_id)
    
    try:
        # 启动心跳协程
        heartbeat_task = asyncio.create_task(send_heartbeats(websocket, node_id))
        
        # 处理来自节点的消息
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # 更新心跳时间
            node_info.last_heartbeat = time.time()
            
            # 处理不同类型的消息
            if message["type"] == "file_shared":
                await handle_file_shared(node_id, message["file"])
            elif message["type"] == "search":
                await handle_search(node_id, message["query"])
            elif message["type"] == "offer":
                await handle_offer(node_id, message["target_node_id"], message["offer"])
            elif message["type"] == "answer":
                await handle_answer(node_id, message["target_node_id"], message["answer"])
            elif message["type"] == "ice_candidate":
                await handle_ice_candidate(node_id, message["target_node_id"], message["candidate"])
            elif message["type"] == "heartbeat":
                # 心跳响应，只需更新时间戳
                pass
            elif message["type"] == "get_all_files":
                await send_all_files(node_id)
    except WebSocketDisconnect:
        logger.info(f"节点 {node_id} 已断开连接")
    except Exception as e:
        logger.error(f"节点 {node_id} 发生错误: {str(e)}")
    finally:
        # 取消心跳任务
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        
        # 清理节点信息
        await cleanup_node(node_id)

# 处理文件共享
async def handle_file_shared(node_id: str, file_data: dict):
    file_id = file_data["id"]
    
    # 检查文件是否已存在
    if file_id in files:
        # 增加来源计数
        files[file_id].sources += 1
    else:
        # 创建新文件信息
        file_info = FileInfo(
            file_id=file_id,
            name=file_data["name"],
            size=file_data["size"],
            actual_size=file_data["actualSize"],
            file_type=file_data["type"],
            node_id=node_id
        )
        files[file_id] = file_info
        
    # 添加到节点的文件列表
    node_files[node_id].add(file_id)
    
    # 广播文件共享消息
    await broadcast_file_shared(file_data)
    
    # 显示系统状态
    show_system_status()

# 处理搜索请求
async def handle_search(node_id: str, query: str):
    query = query.lower()
    results = []
    
    # 在文件索引中搜索匹配项
    for file_id, file_info in files.items():
        if query in file_info.name.lower() or query in (get_artist_name(file_info.name).lower() if get_artist_name(file_info.name) else ""):
            # 查找所有拥有该文件的节点
            file_nodes = [n_id for n_id, f_ids in node_files.items() if file_id in f_ids]
            
            results.append({
                "id": file_id,
                "name": file_info.name,
                "artist": get_artist_name(file_info.name),
                "size": file_info.size,
                "actualSize": file_info.actual_size,
                "sources": len(file_nodes),
                "node_ids": file_nodes
            })
    
    # 发送搜索结果
    await send_message_to_node(node_id, {
        "type": "search_results",
        "results": results
    })

# 处理WebRTC offer
async def handle_offer(source_node_id: str, target_node_id: str, offer: dict):
    if target_node_id in nodes and nodes[target_node_id].is_active:
        await send_message_to_node(target_node_id, {
            "type": "offer",
            "source_node_id": source_node_id,
            "offer": offer
        })
    else:
        # 目标节点不存在或不活跃
        await send_message_to_node(source_node_id, {
            "type": "peer_error",
            "message": "目标节点不可用"
        })

# 处理WebRTC answer
async def handle_answer(source_node_id: str, target_node_id: str, answer: dict):
    if target_node_id in nodes and nodes[target_node_id].is_active:
        await send_message_to_node(target_node_id, {
            "type": "answer",
            "source_node_id": source_node_id,
            "answer": answer
        })
    else:
        # 目标节点不存在或不活跃
        await send_message_to_node(source_node_id, {
            "type": "peer_error",
            "message": "目标节点不可用"
        })

# 处理ICE候选
async def handle_ice_candidate(source_node_id: str, target_node_id: str, candidate: dict):
    if target_node_id in nodes and nodes[target_node_id].is_active:
        await send_message_to_node(target_node_id, {
            "type": "ice_candidate",
            "source_node_id": source_node_id,
            "candidate": candidate
        })

# 发送心跳包
async def send_heartbeats(websocket: WebSocket, node_id: str):
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            if node_id in nodes and nodes[node_id].is_active:
                # 检查节点是否活跃
                elapsed = time.time() - nodes[node_id].last_heartbeat
                if elapsed > 2 * HEARTBEAT_INTERVAL:
                    logger.warning(f"节点 {node_id} 心跳超时，标记为不活跃")
                    nodes[node_id].is_active = False
                else:
                    # 发送心跳
                    try:
                        await websocket.send_text(json.dumps({"type": "heartbeat"}))
                    except Exception as e:
                        logger.error(f"发送心跳到节点 {node_id} 失败: {str(e)}")
    except asyncio.CancelledError:
        # 任务被取消，正常退出
        pass

# 清理节点信息
async def cleanup_node(node_id: str):
    if node_id in nodes:
        # 从节点列表中删除
        del nodes[node_id]
        
        # 更新文件来源计数和删除无人共享的文件
        if node_id in node_files:
            for file_id in node_files[node_id]:
                if file_id in files:
                    files[file_id].sources -= 1
                    if files[file_id].sources <= 0:
                        del files[file_id]
            del node_files[node_id]
        
        # 广播节点断开连接
        await broadcast_node_connection(node_id, "disconnected")
        
        # 显示系统状态
        show_system_status()

# 广播节点连接/断开消息
async def broadcast_node_connection(node_id: str, status: str):
    message = {
        "type": "node_status",
        "node_id": node_id,
        "status": status
    }
    
    for n_id, node_info in nodes.items():
        if n_id != node_id and node_info.is_active:
            try:
                await node_info.websocket.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"向节点 {n_id} 广播节点状态失败: {str(e)}")

# 发送节点列表给特定节点
async def send_node_list(node_id: str):
    if node_id in nodes:
        active_nodes = [n_id for n_id, node_info in nodes.items() if node_info.is_active and n_id != node_id]
        
        await send_message_to_node(node_id, {
            "type": "node_list",
            "nodes": active_nodes
        })

# 广播文件共享消息
async def broadcast_file_shared(file_data: dict):
    message = {
        "type": "file_shared",
        "file": file_data
    }
    
    for node_id, node_info in nodes.items():
        if node_info.is_active and node_id != file_data["nodeId"]:
            try:
                await node_info.websocket.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"向节点 {node_id} 广播文件共享失败: {str(e)}")

# 向特定节点发送消息
async def send_message_to_node(node_id: str, message: dict):
    if node_id in nodes and nodes[node_id].is_active:
        try:
            await nodes[node_id].websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error(f"向节点 {node_id} 发送消息失败: {str(e)}")

# 发送所有文件列表给节点
async def send_all_files(node_id: str):
    if node_id in nodes:
        all_files = []
        
        for file_id, file_info in files.items():
            # 查找所有拥有该文件的节点
            file_nodes = [n_id for n_id, f_ids in node_files.items() if file_id in f_ids]
            
            all_files.append({
                "id": file_id,
                "name": file_info.name,
                "artist": get_artist_name(file_info.name),
                "size": file_info.size,
                "actualSize": file_info.actual_size,
                "sources": len(file_nodes),
                "node_ids": file_nodes
            })
        
        await send_message_to_node(node_id, {
            "type": "all_files",
            "files": all_files
        })

# 从文件名提取艺术家名称（简单实现）
def get_artist_name(file_name: str) -> Optional[str]:
    # 简单的规则：如果文件名包含'-'，则假设'-'前是艺术家名
    if '-' in file_name:
        parts = file_name.split('-', 1)
        return parts[0].strip()
    return None

# 显示系统状态
def show_system_status():
    active_nodes_count = sum(1 for node in nodes.values() if node.is_active)
    total_files_count = len(files)
    
    # 清除当前行并显示新状态
    sys.stdout.write('\r')
    sys.stdout.write(f"[系统状态] 活跃节点数: {active_nodes_count}, 共享文件数: {total_files_count}                    ")
    sys.stdout.flush()

# 启动服务器前的初始化
@app.on_event("startup")
async def startup_event():
    logger.info("P2P音乐共享系统服务器已启动")
    logger.info("WebSocket服务已就绪，等待节点连接...")
    
    # 定期显示系统状态
    async def show_periodic_status():
        while True:
            await asyncio.sleep(10)
            show_system_status()
    
    # 启动定期显示状态的任务
    asyncio.create_task(show_periodic_status())

# 优雅关闭服务器
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("服务器正在关闭，清理资源...")
    
    # 向所有节点发送关闭通知
    for node_id, node_info in nodes.items():
        if node_info.is_active:
            try:
                await node_info.websocket.send_text(json.dumps({"type": "server_shutdown"}))
                await node_info.websocket.close()
            except Exception as e:
                logger.error(f"关闭节点 {node_id} 连接失败: {str(e)}")
    
    # 清空所有数据
    nodes.clear()
    files.clear()
    node_files.clear()
    
    logger.info("所有资源已清理，服务器已关闭")

# 启动服务器的代码
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)