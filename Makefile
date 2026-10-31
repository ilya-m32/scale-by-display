NAME=scale-by-display
VERSION=$(shell jq -r '.version' package.json)
PACK=$(NAME)_v$(VERSION)
DOMAIN=ilya-m.com

.PHONY: all pack install clean lint format

all: dist/extension.js

node_modules: package.json package-lock.json
	npm install

dist/extension.js dist/prefs.js: node_modules
	./node_modules/.bin/tsc

publish/$(PACK).zip: dist/extension.js dist/prefs.js
	@rm -rf dist/schemas
	@mkdir -p dist/schemas
	@cp schemas/*.gschema.xml dist/schemas/
	@cp metadata.json dist/
	@mkdir -p publish/
	@rm -f publish/$(PACK).zip
	@(cd dist && zip ../publish/$(PACK).zip -9r .)

pack: publish/$(PACK).zip

install: publish/$(PACK).zip
	@touch ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)
	@rm -rf ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)
	@mv dist ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)

clean:
	@rm -rf dist node_modules publish/

lint: node_modules
	./node_modules/.bin/biome check .

format: node_modules
	./node_modules/.bin/biome format --write .
