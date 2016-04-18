// Name: ocr-gt-tools.js

var UISettings = {
    zoomInFactor: 1.4,
    zoomOutFactor: 0.8,
    scrollDelay: 500,
};

var Utils = {};

/********************/
/* Utiliy functions */
/********************/

/**
 * Transform text file to array of line lineComments
 *
 * @param {string} txt Contents of the text file
 * @param {object} target the object to attach 'pageComment'/'lineComments' to
 */
Utils.parseLineComments = function parseLineComments(txt, target) {
    var lines = txt.split(/\n/);
    var lineComments = [];
    for (var i = 0; i < lines.length ; i++) {
        var lineComment = lines[i].replace(/^\d+:\s*/, '');
        lineComments.push(lineComment);
    }
    target.pageComment = lineComments[0];
    target.lineComments = lineComments.slice(1);
};

/**
 * Scale the 'height' attribute of an element by a factor,
 * effectively zooming images.
 *
 * @param {DOMElement} el the element to scale
 * @param {float} factor the scale factor
 */
Utils.scaleHeight = function scaleHeight(el, factor) {
    var curHeight = el.getAttribute('height') || el.offsetHeight;
    if (!el.hasAttribute('data-original-height')) {
        el.setAttribute('data-original-height', curHeight);
    }
    var originalHeight = el.getAttribute('data-original-height');
    var newHeight = factor == 1 ? originalHeight : curHeight * factor;
    el.setAttribute('height',  newHeight);
};

/**
 * Attach current UNIX time as a URL parameter to a URL so a GET request to it
 * won't be cached.
 *
 * @param {string} url the URL to timestamp
 */
Utils.uncachedURL = function uncachedURL(url) {
    return url + "?nocache=" + Date.now();
};

/**
 * Test whether element is within viewport
 * No jQuery necessary.
 * Thanks to Dan's StackOverflow answer for this:
 * http://stackoverflow.com/questions/123999/how-to-tell-if-a-dom-element-is-visible-in-the-current-viewport
*/
function isElementInViewport(el) {
    var rect = el.getBoundingClientRect();
    return (rect.top >= 0 && rect.left >= 0);
}

/*******************************/
/* Client-Server communication */
/*******************************/

/**
 * Loads a URL for editing.
 *
 * @param {string} url The image URL to load
 */
function loadGtEditLocation(url, callback) {

    if (!url) {
        return;
    }
    $("#wait_load").removeClass("hidden");
    $('#file_name').html(url);
    $('#file_image').html('<img src=' + url + '>');

    $.ajax({
        type: 'POST',
        url: 'ocr-gt-tools.cgi?action=create',
        data: {"data_url": url},
        beforeSend: function(xhr) {
            // To instantly see when a new document has been retrieved
            $("#file_correction").addClass("hidden");
        },
        success: function(res) {
            // File correction will be loaded
            window.ocrGtLocation = res;
            $.get(Utils.uncachedURL(window.ocrGtLocation.correctionUrl), function(html) {
                $("#file_correction").html('');
                var tables = $(html).filter('table');
                for (var i =0 ; i < tables.length ; i++) {
                    $("#file_correction").append($(tables[i]).clone());
                }
                handleCorrectionAjax();
            });
            $("#zoom_button_plus").removeClass("hidden");
            $("#zoom_button_minus").removeClass("hidden");
            $("#save_button").removeClass("hidden");

            // Add links to downloads to the DOM
            $("#file_links").html(
                "<div id='file_rem'><a download href='" + res.commentsUrl + "' target='_blank'>anmerkungen.txt</a></div>" +
                "<div id='file_o_rem'><a download href='" + res.correctionUrl + "' target='_blank'>correction.html</a></div>");

        },
        error: function(x, e) {
            window.alert(x.status + " FEHLER aufgetreten: \n" + e);
        },
    });
}

/**
 * Handle a $load completion event.
 *
 * @param {object} response
 * @param {string} status
 * @param {object} xhr
 *
 */
function handleCorrectionAjax(response, status, xhr) {
    $.ajax({
        type: 'GET',
        url: Utils.uncachedURL(window.ocrGtLocation.commentsUrl),
        error: function(x, e) {
            window.alert(x.status + " FEHLER aufgetreten: \n" + e);
        },
        success: function(response, status, xhr) {
            Utils.parseLineComments(response, window.ocrGtLocation);
            addCommentFields();
            // Hide waiting spinner
            $("#wait_load").addClass("hidden");
            // Show new document
            $("#file_correction").removeClass("hidden");
            // Make lines as wide as the widest line
            normalizeInputLengths();
            // Add options for line selection
            $("table").each(function(idx) {
                $("#currentLine").append(
                    $("<option>").text(idx + 1)
                );
            });
            // Trigger scroll event to update position
            // onScroll();
            scrollToLine();
        },
    });
}

/**
 * When the document should be saved back to the server.
 *
 */
function saveGtEditLocation() {

    if (!window.ocrGtLocation.changed) {
        console.log("Nothing changed.");
        return;
    }

    $("#wait_save").addClass("wait").removeClass("hidden");
    $("#disk").addClass("hidden");
    window.ocrGtLocation.transliterations = $('tr:nth-child(3n) td:nth-child(1)').map(function() {
        return $(this).html();
    }).get();
    window.ocrGtLocation.lineComments = $(".lineComment > td").map(function() {
        return $(this).html();
    }).get();
    console.log(window.ocrGtLocation.lineComments);
    window.ocrGtLocation.pageComment = $(".pageComment").html();

    $.ajax({
        type: 'post',
        url: 'ocr-gt-tools.cgi?action=save',
        data: window.ocrGtLocation,
        success: function() {
            // After #file_correction is saved
            window.ocrGtLocation.changed = false;
            $("#wait_save").removeClass("wait").addClass("hidden");
            $("#disk").removeClass("hidden");
            $("#save_button").addClass("inaktiv").removeClass("aktiv");
        },
        error: function(x, e) {
            window.alert(x.status + " FEHLER aufgetreten");
        },
    });
}

/********************/
/* DOM manipulation */
/********************/

/**
 * Set the width of every 'contenteditable' element to the
 * width of the widest 'contenteditable' element.
 */
function normalizeInputLengths() {
    var maxWidth = 0;
    $("img").each(function() {
        maxWidth = Math.max(maxWidth, this.offsetWidth);
    });
    console.log(maxWidth);
    $("*[contenteditable]").css('width', maxWidth);
}

/**
 * Adds comment fields
 */
function addCommentFields() {
    $("td[contenteditable][spellcheck]").each(function(curLine) {
        var curComment = window.ocrGtLocation.lineComments[curLine];
        $(this)
        .parent('tr').append(
            $('<td>')
            .append($('<span class="lineCommentOpen "><i class="fa fa-commenting-o"></i></span>')
                    .toggleClass('hidden', curComment !== ''))
            .append($('<span class="lineCommentClosed "><i class="fa fa-map-o"></i></span>')
                    .toggleClass('hidden', curComment === ''))
            .on('click tap', function() { toggleLineComment($(this).parent('tr').next()); })
        ).closest('table')
            .attr('data-line-number', curLine)
            .append(
                $('<tr class="lineComment">' +
                    '<td contenteditable>' +
                        curComment         +
                    '</td>'                +
                '</tr>').toggleClass('hidden', curComment === '')
            );
    });
    $("#file_correction").prepend(
        '<div class="pageComment" contenteditable>' +
            window.ocrGtLocation.pageComment +
        '</div>'
    );
}

/**
 * Increase zoom by UISettings.zoomInFactor
 */
function zoomIn() {
    $('#file_correction img').each(function() {
        Utils.scaleHeight(this, UISettings.zoomInFactor);
    });
}

/**
 * Decrease zoom by UISettings.zoomOutFactor
 */
function zoomOut() {
    $('#file_correction img').each(function() {
        Utils.scaleHeight(this, UISettings.zoomOutFactor);
    });
}

/**
 * Reset all images to their original size
 */
function zoomReset() {
    $('#file_correction img').each(function() {
        Utils.scaleHeight(this, 1);
    });
}

function scrollToLine() {
    var idx = window.ocrGtLineNumber;
    console.log("Jump to line " + (idx - 1));
    // window.setTimeout(function() {
    // TODO buggy
    var scrollY = $("body table[data-line-number=" + (idx - 1) + "]")[0].offsetTop;
    console.log("table[data-line-number=" + (idx - 1) + "]: " + scrollY);
    $('body').animate({scrollTop: scrollY}, UISettings.scrollDelay);
    // }, 2000);
}

/**
 * Show/hide the line comments for a particular row
 */
function toggleLineComment($tr) {
    $tr.toggleClass("hidden");
    var $prevTr = $tr.prev();
    $("span.lineCommentOpen", $prevTr).toggleClass("hidden");
    $("span.lineCommentClosed", $prevTr).toggleClass("hidden");
}

/******************/
/* Event handlers */
/******************/

function confirmExit(e) {
    if (window.ocrGtLocation && window.ocrGtLocation.changed) {
        window.alert("Ungesicherte Inhalte vorhanden, bitte zuerst speichern!");
        return "Ungesicherte Inhalte vorhanden, bitte zuerst speichern!";
    }
}

function onHashChange() {
    var cHash = window.location.hash;

    if (window.ocrGtLocation && window.ocrGtLocation.changed) {
        confirmExit();
    } else {
        if (cHash === '') {
            return;
        }
        var parts = cHash.substring(1).split('|');
        var newImageUrl = parts[0];
        var lineNumber = parts[1] || 1;
        if (window.ocrGtLocation && newImageUrl === window.ocrGtLocation.imageUrl) {
            window.ocrGtLineNumber = parseInt(lineNumber);
            scrollToLine();
        } else {
            window.ocrGtLineNumber = parseInt(lineNumber);
            loadGtEditLocation(newImageUrl);
        }
    }
}

function onDrop(e) {
    e.preventDefault();

    if (window.ocrGtLocation && window.ocrGtLocation.changed) {
        window.alert("Ungesicherte Inhalte vorhanden, bitte zuerst speichern!");
    } else {
        var dropped = e.originalEvent.dataTransfer.getData('text/html');
        var url = $(dropped).find('img').addBack('img').attr('src');
        if (!url) {
            url = $(dropped).find('a').addBack('a').attr('href');
        }
        if (url) {
            loadGtEditLocation(url);
        } else {
            window.alert("Konnte keine URL erkennen.");
        }
    }
}

/**
 *
 */
function onScroll() {
    var done = false;
    var cur = 0;
    var total = 0;
    $("table").each(function() {
        total += 1;
        if (done) {
            return;
        }
        if (isElementInViewport(this)) {
            cur = 1 + parseInt(this.getAttribute('data-line-number'));
            done = true;
        }
    });
    $("#currentLine").val(cur);
}

$(function onPageLoaded() {
    window.onhashchange = onHashChange;
    window.onbeforeunload = confirmExit;
    window.onscroll = onScroll;
    $(document).bind('drop dragover', function(e) {
        // Prevent the default browser drop action:
        e.preventDefault();
    });
    $(document).bind('drop', function(e) {
    });
    // Event listeners
    $("#save_button").on("click", saveGtEditLocation);
    $("#zoom_button_plus").on("click", zoomIn);
    $("#zoom_button_minus").on("click", zoomOut);
    $("#zoom_button_reset").on("click", zoomReset);
    $("#file_correction").on('input', function onInput() {
        $("#save_button").removeClass("inaktiv").addClass("aktiv");
        window.ocrGtLocation.changed = true;
    });
    $("#expand_all_comments").on("click", function onClickExpand() {
        $("tr.lineComment").removeClass('hidden');
        onScroll();
    });
    $("#collapse_all_comments").on("click", function onClickCollapse() {
        $("tr.lineComment").addClass('hidden');
        onScroll();
    });
    $("#currentLine").on('change', function() {
        var newNumber = parseInt($(this).val());
        window.location.hash = window.location.hash.replace(/(\|.*)?$/, '|' + newNumber);
    });
    onHashChange();
});

// Vim: sw=4 ts=4 fdm=syntax:
