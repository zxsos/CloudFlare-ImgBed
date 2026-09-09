import { fetchSecurityConfig } from "../../utils/sysConfig";

let securityConfig = {}
let rightAuthCode = null

async function errorHandling(context) {
    try {
      return await context.next();
    } catch (err) {
      return new Response(`${err.message}\n${err.stack}`, { status: 500 });
    }
  }

function UnauthorizedException(reason) {
  return new Response(reason, {
      status: 401,
      statusText: 'Unauthorized',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Cache-Control': 'no-store',
        'Content-Length': reason.length,
      },
    });
}

function getCookieValue(cookies, name) {
    const match = cookies.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

function isAuthCodeDefined(authCode) {
    return authCode !== undefined && authCode !== null && String(authCode).trim() !== '';
}

// 认证码来源优先级：URL 参数 -> 请求头 -> Cookie
function getAuthCode(request) {
    let authCode = null;
    try {
        authCode = new URL(request.url).searchParams.get('authCode');
    } catch (e) {
        console.error('Invalid request URL:', e);
    }
    if (!authCode) {
        authCode = request.headers.get('authCode');
    }
    if (!authCode) {
        const cookies = request.headers.get('Cookie');
        if (cookies) {
            authCode = getCookieValue(cookies, 'authCode');
        }
    }
    return authCode;
}

async function authentication(context) {
  // 读取安全配置
  securityConfig = await fetchSecurityConfig(context.env);
  rightAuthCode = securityConfig.auth.user.authCode;

  // 未绑定 KV 时禁用管理端
  if (typeof context.env.img_url == "undefined" || context.env.img_url == null || context.env.img_url == "") {
      return new Response('Dashboard is disabled. Please bind a KV namespace to use this feature.', { status: 200 });
  }

  // 未设置认证码时不鉴权，保持与原版一致
  if (!isAuthCodeDefined(rightAuthCode)) {
      return context.next();
  }

  const authCode = getAuthCode(context.request);
  if (authCode !== rightAuthCode) {
      return UnauthorizedException('Unauthorized');
  }

  return context.next();
}

export const onRequest = [errorHandling, authentication];
