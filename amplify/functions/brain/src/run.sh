#!/bin/sh
cd /var/task || exit 1
exec python3 -m web_server
