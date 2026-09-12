#!/usr/bin/env python3
"""Servidor local de desenvolvimento. O http.server padrao deixa o navegador
cachear CSS e JS, o que faz uma alteracao parecer que nao surtiu efeito."""
import http.server, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()
    def log_message(self, *a): pass

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), NoCache) as httpd:
    print(f'servindo em http://127.0.0.1:{PORT}')
    httpd.serve_forever()
