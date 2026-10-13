# Atajos: toda la lógica está en tasks.py (funciona igual en Linux, macOS y Windows).
# Sin make:  python tasks.py <tarea>

ifeq ($(OS),Windows_NT)
PYTHON ?= python
else
PYTHON ?= $(shell command -v python3 2>/dev/null || echo python)
endif

.PHONY: help install dev backend frontend test seed types lint build

help:
	@$(PYTHON) tasks.py

install:
	@$(PYTHON) tasks.py install

dev:
	@$(PYTHON) tasks.py dev

backend:
	@$(PYTHON) tasks.py backend

frontend:
	@$(PYTHON) tasks.py frontend

test:
	@$(PYTHON) tasks.py test

seed:
	@$(PYTHON) tasks.py seed

types:
	@$(PYTHON) tasks.py types

lint:
	@$(PYTHON) tasks.py lint

build:
	@$(PYTHON) tasks.py build
