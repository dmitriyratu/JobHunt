# Uses Git Bash explicitly so this works the same whether `make` is invoked
# from PowerShell, cmd, or Git Bash itself.
SHELL := C:/Program Files/Git/usr/bin/bash.exe
.SHELLFLAGS := -c

# Must match the -p flag in package.json's "dev" script.
PORT := 3001

.PHONY: dev stop

dev: stop
	@echo "Starting dev server on port $(PORT)..."
	npm run dev

stop:
	@pids=$$(netstat -ano | grep ":$(PORT)" | grep LISTENING | awk '{print $$NF}' | sort -u); \
	if [ -n "$$pids" ]; then \
		for pid in $$pids; do \
			echo "Stopping process on port $(PORT) (PID $$pid)..."; \
			taskkill //PID $$pid //F >/dev/null 2>&1 || true; \
		done; \
		sleep 1; \
	else \
		echo "No process currently listening on port $(PORT)."; \
	fi
