NAME=scale-by-display
VERSION=$(shell jq -r '.version' package.json)
PACK=$(NAME)_v$(VERSION)
DOMAIN=ilya-m.com

.PHONY: all pack install clean lint format

all: dist/extension.js

node_modules: package.json
	npm install

dist/extension.js dist/prefs.js: node_modules
	npx tsc

schemas/gschemas.compiled: schemas/org.gnome.shell.extensions.$(NAME).gschema.xml
	glib-compile-schemas schemas

publish/$(PACK).zip: dist/extension.js dist/prefs.js schemas/gschemas.compiled
	@cp -r schemas dist/
	@cp metadata.json dist/
	@mkdir -p publish/
	@(cd dist && zip ../publish/$(PACK).zip -9r .)

pack: publish/$(PACK).zip

install: publish/$(PACK).zip
	@touch ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)
	@rm -rf ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)
	@mv dist ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)

clean:
	@rm -rf dist node_modules publish/

lint:
	npx biome check .

format:
	npx biome format --write .
