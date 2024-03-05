const axios = require("axios");
const yargs = require("yargs");
const fs = require("fs");
const path = require("path");

const PAGE_SIZE = 30;
let dstDir = ".";

// 使用 axios 封装的 HTTP GET 请求，带重试功能
const fetchWithRetry = async (url, maxAttempts = 5, delay = 5000) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      if (attempt === maxAttempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// 解析 JSON 数据
const decodeJson = (data, path) => {
  return path.reduce((acc, part) => acc && acc[part], data);
};

// 通过音轨 ID 获取音轨并下载
const fetchTrackById = async (trackId) => {
  const result = await fetchWithRetry(
    `http://mobile.ximalaya.com/v1/track/baseInfo?device=iPhone&trackId=${trackId}`,
  );
  const title = result.title.replace(/[\/:*?"<>|]/g, ""); // 移除文件名中的非法字符
  const url64 = result.playUrl64.replace(/\\/g, "");

  if (url64) {
    const response = await axios({
      url: url64,
      method: "GET",
      responseType: "stream",
    });
    const filePath = path.resolve(dstDir, `${title}.mp3`);
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  } else {
    console.log(`无法获取音轨 ${trackId} 的下载链接。`);
  }
};

// 获取专辑中的音轨总数
const fetchAlbumTrackCount = async (albumId) => {
  const content = await fetchWithRetry(
    `https://www.ximalaya.com/revision/album/v1/getTracksList?albumId=${albumId}&pageNum=1&pageSize=1`,
  );
  return decodeJson(content, ["data", "trackTotalCount"]);
};

// 按页获取音轨
const fetchTracksByPage = async (albumId, pageNum) => {
  const content = await fetchWithRetry(
    `https://www.ximalaya.com/revision/album/v1/getTracksList?albumId=${albumId}&pageNum=${pageNum}&pageSize=${PAGE_SIZE}`,
  );
  const trackIds = decodeJson(content, ["data", "tracks"]).map(
    (track) => track.trackId,
  );
  for (const trackId of trackIds) {
    await fetchTrackById(trackId);
  }
};

// 获取专辑中的所有音轨
const fetchAllTracks = async (albumId) => {
  const totalTracks = await fetchAlbumTrackCount(albumId);
  const totalPages = Math.ceil(totalTracks / PAGE_SIZE);
  for (let page = 1; page <= totalPages; page++) {
    await fetchTracksByPage(albumId, page);
  }
};

// 解析命令行参数
const argv = yargs
  .usage("用法: $0 [选项] <albumId> <类型> [类型参数1 [类型参数2 ...]]")
  .help("h")
  .alias("h", "help")
  .option("o", {
    alias: "output",
    describe: "设置下载目录",
    type: "string",
    default: ".",
  }).argv;

// 主函数
const main = async () => {
  const { _, o } = argv;
  if (_.length < 2) {
    yargs.showHelp();
    return;
  }

  const [albumId, type, ...params] = _;
  dstDir = o;

  try {
    switch (type) {
      case "all":
        await fetchAllTracks(albumId);
        break;
      case "page":
        for (const pageNum of params) {
          await fetchTracksByPage(albumId, pageNum);
        }
        break;
      case "track":
        for (const trackId of params) {
          await fetchTrackById(trackId);
        }
        break;
      default:
        console.log(`不支持的类型: ${type}`);
        yargs.showHelp();
    }
  } catch (error) {
    console.error(`发生错误: ${error.message}`);
  }
};

main();
