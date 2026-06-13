export async function onRequest(context) {
    // 1. 获取前端发过来的原始请求
    const request = context.request;
    const url = new URL(request.url);
  
    // 2. 剥离掉 /api 前缀，拼接出 Vercel 后端的真实请求地址
    // 例如：前端请求 /api/login/qr/key，就会变成 https://api-enhanced-theta-murex.vercel.app/login/qr/key
    const targetPath = url.pathname.replace('/api', '');
    const targetUrl = 'https://api-enhanced-theta-murex.vercel.app' + targetPath + url.search;
  
    // 3. 让 Cloudflare 服务器化身替身使者，代替你去 Vercel 拿数据
    const proxyRequest = new Request(targetUrl, request);
    return fetch(proxyRequest);
  }