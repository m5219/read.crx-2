SRC_DIR = code
DBG_DIR = debug

LIB_FILES = ${shell find ${SRC_DIR}/lib/ -type f}
IMG_FILES = ${shell find ${SRC_DIR}/img/ -type f}

QUNIT_FILES =\
	${SRC_DIR}/test/test.html\
	${SRC_DIR}/test/qunit/qunit.js\
	${SRC_DIR}/test/qunit/qunit.css

.PHONY: all
all:\
	${DBG_DIR}\
	${DBG_DIR}/manifest.json\
	${DBG_DIR}/app.html\
	${DBG_DIR}/app.js\
	${DBG_DIR}/ui.js\
	${DBG_DIR}/app.css\
	${DBG_DIR}/lib/\
	${DBG_DIR}/img/\
	${DBG_DIR}/test/\
	${DBG_DIR}/test/test.js

.PHONY: clean
clean:
	rm -rf ${DBG_DIR}

${DBG_DIR}:
	mkdir ${DBG_DIR}

${DBG_DIR}/manifest.json: ${SRC_DIR}/manifest.json
	cp ${SRC_DIR}/manifest.json ${DBG_DIR}/manifest.json

${DBG_DIR}/app.html: ${SRC_DIR}/app.html
	cp ${SRC_DIR}/app.html ${DBG_DIR}/app.html

${DBG_DIR}/app.js: ${SRC_DIR}/app.coffee ${SRC_DIR}/app.*.coffee
	coffee -b -p -c ${SRC_DIR}/app.coffee ${SRC_DIR}/app.*.coffee | cat > ${DBG_DIR}/app.js

${DBG_DIR}/ui.js: ${SRC_DIR}/ui.*.coffee
	coffee -b -p -c ${SRC_DIR}/ui.*.coffee | cat > ${DBG_DIR}/ui.js

${DBG_DIR}/app.css: ${SRC_DIR}/app.sass
	sass --style compressed --no-cache ${SRC_DIR}/app.sass ${DBG_DIR}/app.css

${DBG_DIR}/lib/: ${LIB_FILES}
	rm -rf ${DBG_DIR}/lib/
	cp -r ${SRC_DIR}/lib/ ${DBG_DIR}/lib/

${DBG_DIR}/img/: ${IMG_FILES}
	rm -rf ${DBG_DIR}/img/
	cp -r ${SRC_DIR}/img/ ${DBG_DIR}/img/

${DBG_DIR}/test/: ${QUNIT_FILES}
	mkdir -p ${DBG_DIR}/test/
	cp ${SRC_DIR}/test/test.html ${DBG_DIR}/test/test.html
	
	cp -r ${SRC_DIR}/test/qunit/ ${DBG_DIR}/test/qunit/

${DBG_DIR}/test/test.js: ${DBG_DIR}/test/
	coffee -b -p -c ${SRC_DIR}/test/ | cat > ${DBG_DIR}/test/test.js
