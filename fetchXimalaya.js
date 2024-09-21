const axios = require("axios");
const yargs = require("yargs");
const fs = require("fs");
const path = require("path");

const PAGE_SIZE = 30;
let dstDir = ".";

// 使用 axios 封装的 HTTP GET 请求，带重试功能和认证
const fetchWithRetry = async (url, maxAttempts = 5, delay = 5000) => {
  const headers = {
    'accept': '*/*',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'xm-sign': 'D26OshXVxP4LrRvG9KJdsAheg3JgaaKARkRkU6nXBoUc4Xe3&&i_k7yhIR_560Tb3vwjggNux1i6e-5AViI_OJGALTmrE_1',
    'referer': 'https://www.ximalaya.com/album/53287048'
  };

  const cookies = '_xmLog=h5&ffcc3e35-0323-4001-a28f-1f64f4bddde4&process.env.sdkVersion; xm-page-viewid=ximalaya-web; DATE=1726907667689; impl=www.ximalaya.com.login; wfp=ACMwYjQzMGQ3MGEwMWZiZTRlxzHyS3ahlzJ4bXdlYl93d3c; crystal=U2FsdGVkX1+iXQM9WFmqwmAgJzVGmBcGVbxa8kLYDzgyH1EjnxoLX5t40GPlkjDtXswaGmC1AM43NiEU9YmVD5ixBmX4qCuOQ4fZaG+AcWLVfCew0VqAljVgFb8uR1S+m9UyyRVQkIN5xmzRIz3PYYrlOOpUOycK7OWsz2QiknDQ+WJcFL5eUfdV0AR7d7kln6baX62EXn7V3k9obxhVjsFZnflAK276AVsiyUGs/s+6heg9OHWBN7sFGKvmj5Id; Hm_lvt_4a7d8ec50cfd6af753c4f8aee3425070=1726907714; HMACCOUNT=B86700D4AC2FAD27; 1&remember_me=y; 1&_token=186488793&92EF38B0240NC08CE0499331D738228C665BA6B07DEE2C81613CD45351E4EC9B707980EF05DC127M2D817B53A2DBD21_; 1_l_flag=186488793&92EF38B0240NC08CE0499331D738228C665BA6B07DEE2C81613CD45351E4EC9B707980EF05DC127M2D817B53A2DBD21__2024-09-2116:54:35; Hm_lpvt_4a7d8ec50cfd6af753c4f8aee3425070=1726908878; web_login=1726908984227; cmci9xde=U2FsdGVkX18wz+ouVWH+5nhoc72Mw32+iGf9CLXNubvcuewfJ4KbE6deblW7fADSJjCF2SMg9qhRMxeO+7U5dw==; pmck9xge=U2FsdGVkX1/ABd4QwmrIoF6IpILWbOY04gOj+KhQX0g=; assva6=U2FsdGVkX18r1t3WQYXC4GU/U8o8CDBUS0MWrkf9qGQ=; assva5=U2FsdGVkX18uhALIRv5nyY+vwMsCki/8fXB5PpdeEAnC5LHh77P1Mhu4mPXpNSNR6QWmPFVK4G0qudlbg/e2AA==; vmce9xdq=U2FsdGVkX1+7kSGSju1QuubCiUbWCDwa2UuwjcowkOBTvoSuLU8JZazVefCoRoA03nJSe3+Jd5mBJM/b8mWSnhANSFrKlStRBYTLnoVdmh+fNNIR1+tYXE66PKLwhBnNZOIXqUWzMtuRqI8X5ZyTfc2nFahp/rYA4rWZj87dzPc=';

  headers['cookie'] = cookies;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error) {
      console.log(`第 ${attempt + 1} 次请求失败: ${error.message}`);
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
