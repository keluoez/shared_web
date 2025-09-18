#!/usr/bin/env python3
"""
P2P音乐共享系统 - FastAPI服务器

这个脚本导入并运行主应用程序，提供完整的P2P音乐共享功能，包括：
- WebSocket通信管理
- 节点注册与发现
- 文件索引与搜索
- WebRTC信令中转
- 静态文件服务
"""

import sys
import uvicorn
import os
import socket

# 检查Python版本
if sys.version_info < (3, 8):
    print("错误: 需要Python 3.8或更高版本")
    sys.exit(1)

# 服务器配置
PORT = 8000
HOST = '0.0.0.0'  # 允许从任何IP访问

# 获取当前脚本所在目录
base_dir = os.path.dirname(os.path.abspath(__file__))

# 获取本机所有IP地址
def get_local_ips():
    ips = []
    try:
        # 获取主机名
        hostname = socket.gethostname()
        # 获取所有IP地址
        addr_info = socket.getaddrinfo(hostname, None, socket.AF_INET)
        for info in addr_info:
            ip = info[4][0]
            # 排除环回地址和Docker虚拟地址
            if not ip.startswith('127.') and not ip.startswith('172.'):
                ips.append(ip)
        # 如果没有找到合适的IP，使用127.0.0.1
        if not ips:
            ips = ['127.0.0.1']
    except:
        ips = ['127.0.0.1']
    return ips

def run_server():
    """启动FastAPI服务器"""
    try:
        # 导入主应用
        from main import app
        
        # 获取本机IP地址
        local_ips = get_local_ips()
        
        print(f"\n=== P2P音乐共享系统 - FastAPI服务器 ===")
        print(f"服务器已启动，可通过以下地址访问:")
        
        # 显示localhost链接
        print(f"  - http://localhost:{PORT}")
        
        # 显示所有本机IP地址的链接
        for ip in local_ips:
            if ip != '127.0.0.1':
                print(f"  - http://{ip}:{PORT}")
        
        print(f"WebSocket端点格式: ws://[IP地址]:{PORT}/ws/[node_id]")
        print(f"服务目录: {base_dir}")
        print(f"按 Ctrl+C 停止服务器...\n")
        
        # 启动服务器
        uvicorn.run(
            "main:app", 
            host=HOST, 
            port=PORT, 
            reload=True,
            log_level="info"
        )
    except KeyboardInterrupt:
        print("\n服务器已停止")
    except ImportError as e:
        print(f"导入模块失败: {e}")
        print("请确保已安装所有依赖：pip install -r requirements.txt")
    except Exception as e:
        print(f"服务器启动失败: {e}")

if __name__ == "__main__":
    # 运行服务器
    run_server()