function createSSEStream() {
    let clients = [];

    function middleware(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        res.write(`data: ${JSON.stringify({ type: 'log', message: 'Connected to log stream.' })}\n\n`);
        clients.push(res);
        req.on('close', () => {
            clients = clients.filter(c => c !== res);
        });
    }

    function broadcast(message, type = 'log') {
        const data = JSON.stringify({ type, message });
        clients.forEach(res => res.write(`data: ${data}\n\n`));
    }

    function log(msg) {
        console.log(msg);
        broadcast(msg, 'log');
    }

    return { middleware, broadcast, log };
}

module.exports = { createSSEStream };
