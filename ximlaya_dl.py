'''
这个脚本使用 argparse 库来处理命令行参数，允许用户选择下载单个音轨、整个专辑或专辑内的某一页。请确保在使用之前，你已经安装了 requests 库，可以通过 pip install requests 命令安装。
'''
import requests
import argparse
import os
from pathlib import Path

def fetch_with_retry(url, max_retries=5):
    for _ in range(max_retries):
        try:
            response = requests.get(url)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"请求失败，正在重试: {e}")
    raise Exception("达到最大重试次数，失败。")

def download_track(track_id, dst_dir):
    track_info_url = f"https://www.ximalaya.com/revision/play/v1/audio?id={track_id}&ptype=1"
    track_info = fetch_with_retry(track_info_url)
    if not track_info:
        print(f"无法获取音轨 {track_id} 的信息。")
        return

    track_url = track_info['data']['src']
    track_title = track_info['data']['trackName'].replace('/', '_')  # 替换或移除文件名中的非法字符
    file_name = f"{track_title}.m4a"
    file_path = os.path.join(dst_dir, file_name)

    # 下载音频文件
    print(f"正在下载: {file_name}")
    response = requests.get(track_url)
    with open(file_path, 'wb') as file:
        file.write(response.content)

def fetch_and_download_album_tracks(album_id, dst_dir, page_num=None):
    page_size = 30
    if page_num is None:
        # 下载全部音轨
        total_pages = 1  # 初始假设至少有一页
        current_page = 1
    else:
        # 仅下载指定页的音轨
        total_pages = page_num
        current_page = page_num

    while current_page <= total_pages:
        url = f"https://www.ximalaya.com/revision/album/v1/getTracksList?albumId={album_id}&pageNum={current_page}&pageSize={page_size}"
        data = fetch_with_retry(url)
        if data:
            tracks = data['data']['tracks']
            for track in tracks:
                download_track(track['trackId'], dst_dir)

            if page_num is None and current_page == 1:
                total_tracks = data['data']['trackTotalCount']
                total_pages = (total_tracks + page_size - 1) // page_size

            current_page += 1
        else:
            print("无法获取专辑信息。")
            break

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='下载喜马拉雅音频')
    parser.add_argument('--type', choices=['track', 'album', 'page'], required=True, help='下载类型：单个音轨、整个专辑或专辑内的某一页')
    parser.add_argument('--id', required=True, help='音轨ID或专辑ID')
    parser.add_argument('--page', type=int, help='当type为page时，此参数指定要下载的页码')
    parser.add_argument('--dst', required=True, help='下载文件的目标目录')

    args = parser.parse_args()

    # 确保目标目录存在
    Path(args.dst).mkdir(parents=True, exist_ok=True)

    if args.type == 'track':
        download_track(args.id, args.dst)
    elif args.type == 'album':
        fetch_and_download_album_tracks(args.id, args.dst)
    elif args.type == 'page':
        if not args.page:
            print("下载类型为page时，必须指定页码")
        else:
            fetch_and_download_album_tracks(args.id, args.dst, args.page)
