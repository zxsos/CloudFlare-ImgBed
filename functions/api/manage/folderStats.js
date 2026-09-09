export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // group=top（默认）按顶层文件夹聚合；group=all 按完整文件夹路径聚合
    const group = url.searchParams.get('group') || 'top';

    if (typeof env.img_url === "undefined" || env.img_url === null || env.img_url === "") {
        return json({ error: 'Please configure KV database' }, 500);
    }

    const stats = new Map();
    let totalFiles = 0;
    let totalSize = 0;

    let cursor = null;
    do {
        const res = await env.img_url.list({ limit: 1000, cursor: cursor || undefined });
        cursor = res.cursor;

        for (const key of res.keys) {
            // 跳过管理配置类 key
            if (key.name.startsWith('manage@')) continue;

            const md = key.metadata;
            if (!md) continue;

            const sizeMb = parseFloat(md.FileSize) || 0;

            // 文件夹：优先取写入时记录的 Folder，缺失时从 key 路径推断
            let folder = md.Folder;
            if (!folder || folder === '' || folder === '/') {
                const idx = key.name.lastIndexOf('/');
                folder = idx === -1 ? 'root' : key.name.slice(0, idx);
            }
            if (folder === '' || folder === '/') folder = 'root';

            const name = group === 'top'
                ? (folder === 'root' ? 'root' : folder.split('/')[0])
                : folder;

            const item = stats.get(name) || { name, files: 0, sizeMb: 0 };
            item.files += 1;
            item.sizeMb += sizeMb;
            stats.set(name, item);

            totalFiles += 1;
            totalSize += sizeMb;
        }
    } while (cursor);

    const folders = Array.from(stats.values())
        .map(item => ({
            name: item.name,
            files: item.files,
            sizeMb: Math.round(item.sizeMb * 100) / 100,
            sizeBytes: Math.round(item.sizeMb * 1024 * 1024),
            percent: totalSize > 0 ? Math.round((item.sizeMb / totalSize) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.sizeMb - a.sizeMb || b.files - a.files);

    return json({
        group,
        total: {
            files: totalFiles,
            folderCount: folders.length,
            sizeMb: Math.round(totalSize * 100) / 100,
            sizeBytes: Math.round(totalSize * 1024 * 1024),
        },
        folders,
    });
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        },
    });
}
