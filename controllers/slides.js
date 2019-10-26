var fs = require('fs');
var path = require('path');

var parse = require('pug-parser');
var lex = require('pug-lexer');
var wrap = require('pug-runtime/wrap');
var generateCode = require('pug-code-gen');

module.exports = function(express) {
    // Craziness starts here
    var router = express.Router();
    router.get('/:filename/:slideNumber', (req, res) => {
        var filename = req.params.filename + '.pug';
        var filePath = path.join(appRoot + "/tests", filename);
        var slideNumber = parseInt(req.params.slideNumber);

        fs.readFile(filePath, {encoding: 'utf-8'}, function(err, data) {
            if (!err) {
                let slideObj = getSlideObj(data, filename, {slideTitle: req.params.filename, slideNumber: slideNumber});

                // displaying to the user
                slideObj.getLoc ='/slides/' + req.params.filename;
                res.render('slide-viewer', slideObj);
            } else {
                console.log(err);
            }
        });        
    });

    return router;
};

function getSlideObj(src, filename, slideMeta) {
    // parsing the file into a json object?
    var tokens = lex(src, {filename});
    var ast = parse(tokens, {filename, src});

    // Parse the head    
    var head = ast.nodes.find((e) => e.name == 'head');
    //console.log(JSON.stringify(head, null, '  '));

    // We'll obtain the settings and then add in the variables respectively
    var settings = head.block.nodes.find((e) => e.name == 'slideSettings').attrs;
    var headHtml = "";
    var aspectRatio = eval(settings.find((e) => e.name=='aspectRatio').val).replace(':', '/');
    console.log(aspectRatio);
    var theme = '<link rel="stylesheet" type="text/css" href="/css/' + eval(settings.find((e) => e.name=='theme').val) + '.css">';
    headHtml += theme;

    // Record down the mixins listed. We'll need to load this with each slide
    var mixins = head.block.nodes.find((e) => e.type == 'Mixin');

    // Parse the body
    var body = ast.nodes.find((e) => e.name == 'body').block.nodes;
    var bodyHtml;
    if (slideMeta.slideNumber < 0 || slideMeta.slideNumber >= body.length) {
        // Invalid slide number, we'll just assume it's the end of presentation
        bodyHtml = '<div class="slide"><h1> End of Presentation </h1></div>';
    }
    else {
        var selectedSlideAst = body[slideMeta.slideNumber]; // select the slide
        selectedSlideAst.block.nodes.unshift(mixins);       // enable mixins
        //console.log(JSON.stringify(selectedSlideAst, null, '  '))

        // Find animations, if any, and append to head
        var animationListBlock = selectedSlideAst.block.nodes.find(e => e.name == 'animation-list');
        var scriptHtml = "";
        if (animationListBlock != undefined) {
            // Find and remove item from an array
            var i = selectedSlideAst.block.nodes.indexOf(animationListBlock);
            if (i != -1) {
                selectedSlideAst.block.nodes.splice(i, 1);
            }

            parsedAnimationList = [];

            animationList = animationListBlock.block.nodes;
            for (let i = 0; i < animationList.length; ++i) {
                item = animationList[i].attrs;
                var animationItem = { trigger: "onClick", type: undefined, target: undefined }
                for (let j = 0; j < item.length; ++j) {
                    item[j].val = eval(item[j].val);
                    if (item[j].name == "target") animationItem.target = item[j].val;
                    else {
                        if (["onClick", "withPrevious", "afterPrevious"].includes(item[j].val))
                            animationItem.trigger = item[j].val;
                        else
                            animationItem.type = item[j].val;
                    }
                }

                parsedAnimationList.push(animationItem);
            }
            console.log(parsedAnimationList);
            scriptHtml = `
                <script>
                    let animationList = ${JSON.stringify(parsedAnimationList)};
                    $(document).ready(function() {
                        for (let i = 0; i < animationList.length; ++i) {
                            let item = animationList[i];
                            $(item.target).addClass('hidden');
                        }
                        while (animationList.length > 0 && animationList[0].trigger != 'onClick') {
                            let item = animationList.shift();
                            if (item.trigger == 'afterPrevious') {
                                $(item.target).delay(1000).removeClass('hidden').addClass('animated').addClass(item.type);
                            }
                            else {
                                $(item.target).removeClass('hidden').addClass('animated').addClass(item.type);
                            }
                        }
                    });

                    $(document).click(function () {
                        if (animationList.length == 0) return;
                        do {
                            let item = animationList.shift();
                            if (item.trigger == 'afterPrevious') {
                                $(item.target).delay(1000).removeClass('hidden').addClass('animated').addClass(item.type);
                            }
                            else {
                                $(item.target).removeClass('hidden').addClass('animated').addClass(item.type);
                            }
                        } while (animationList.length > 0 && animationList[0].trigger != 'onClick');
                    });
                </script>
            `;
        }
        headHtml += scriptHtml;

        // Generate the slide html
        var funcStr = generateCode(selectedSlideAst, {
            compileDebug: false,
            pretty: true,
            inlineRuntimeFunctions: false,
            templateName: 'helloWorld'  // a bit lost here but it works
        });
        var func = wrap(funcStr, 'helloWorld');
        bodyHtml = func();
    }
    console.log(headHtml);
    console.log(bodyHtml);

    // Return the slideObj -- Note to self: Need to reorganise the obj
    let slideObj = {
        aspectRatio: aspectRatio,
        slideHead: headHtml,
        slideTitle: slideMeta.slideTitle,
        slideBody: bodyHtml,
        slideNumber: slideMeta.slideNumber
    };
    return slideObj;
}