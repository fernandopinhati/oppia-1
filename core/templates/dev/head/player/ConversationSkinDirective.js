// Copyright 2014 The Oppia Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Controller for the conversation skin.
 */

// Note: This file should be assumed to be in an IIFE, and the constants below
// should only be used within this file.
var TIME_FADEOUT_MSEC = 100;
var TIME_HEIGHT_CHANGE_MSEC = 500;
var TIME_FADEIN_MSEC = 100;
var TIME_NUM_CARDS_CHANGE_MSEC = 500;

oppia.animation('.conversation-skin-responses-animate-slide', function() {
  return {
    enter: function(element) {
      element.hide().slideDown();
    },
    leave: function(element) {
      element.slideUp();
    }
  };
});

oppia.animation('.conversation-skin-animate-cards', function() {
  // This removes the newly-added class once the animation is finished.
  var animateCards = function(element, className, done) {
    var tutorCardElt = jQuery(element).find(
      '.conversation-skin-main-tutor-card');
    var supplementalCardElt = jQuery(element).find(
      '.conversation-skin-supplemental-card');

    if (className === 'animate-to-two-cards') {
      supplementalCardElt.css('opacity', '0');
      tutorCardElt.animate({
        'margin-left': '0'
      }, TIME_NUM_CARDS_CHANGE_MSEC, function() {
        tutorCardElt.css('margin-left', '0');
        tutorCardElt.css('margin-right', '');
        tutorCardElt.css('float', 'left');

        supplementalCardElt.animate({
          opacity: '1'
        }, TIME_FADEIN_MSEC, function() {
          supplementalCardElt.css('opacity', '1');
          jQuery(element).removeClass('animate-to-two-cards');

          tutorCardElt.css('margin-left', '');
          tutorCardElt.css('margin-right', '');
          tutorCardElt.css('float', '');
          done();
        });
      });

      return function(cancel) {
        if (cancel) {
          tutorCardElt.css('margin-left', '0');
          tutorCardElt.css('margin-right', '');
          tutorCardElt.css('float', 'left');
          tutorCardElt.stop();

          supplementalCardElt.css('opacity', '1');
          supplementalCardElt.stop();

          jQuery(element).removeClass('animate-to-two-cards');
        }
      };
    } else if (className === 'animate-to-one-card') {
      supplementalCardElt.css('opacity', '0');
      tutorCardElt.animate({
        'margin-left': '262px'
      }, TIME_NUM_CARDS_CHANGE_MSEC, function() {
        tutorCardElt.css('margin-left', 'auto');
        tutorCardElt.css('margin-right', 'auto');
        tutorCardElt.css('float', '');

        supplementalCardElt.css('opacity', '');

        jQuery(element).removeClass('animate-to-one-card');
        done();
      });

      return function(cancel) {
        if (cancel) {
          supplementalCardElt.css('opacity', '0');
          supplementalCardElt.stop();

          tutorCardElt.css('margin-left', '');
          tutorCardElt.css('margin-right', '');
          tutorCardElt.css('float', '');
          tutorCardElt.stop();

          jQuery(element).removeClass('animate-to-one-card');
        }
      };
    } else {
      return;
    }
  };

  return {
    addClass: animateCards
  };
});

oppia.animation('.conversation-skin-animate-card-contents', function() {
  var animateCardChange = function(element, className, done) {
    if (className !== 'animate-card-change') {
      return;
    }

    var currentHeight = element.height();
    var expectedNextHeight = $(
      '.conversation-skin-future-tutor-card ' +
      '.conversation-skin-tutor-card-content'
    ).height();

    // Fix the current card height, so that it does not change during the
    // animation, even though its contents might.
    element.css('height', currentHeight);

    jQuery(element).animate({
      opacity: 0
    }, TIME_FADEOUT_MSEC).animate({
      height: expectedNextHeight
    }, TIME_HEIGHT_CHANGE_MSEC).animate({
      opacity: 1
    }, TIME_FADEIN_MSEC, function() {
      element.css('height', '');
      done();
    });

    return function(cancel) {
      if (cancel) {
        element.css('opacity', '1.0');
        element.css('height', '');
        element.stop();
      }
    };
  };

  return {
    addClass: animateCardChange
  };
});

oppia.directive('conversationSkin', [function() {
  return {
    restrict: 'E',
    scope: {},
    templateUrl: 'skins/Conversation',
    controller: [
      '$scope', '$timeout', '$rootScope', '$window', 'messengerService',
      'oppiaPlayerService', 'urlService', 'focusService',
      'LearnerViewRatingService', 'windowDimensionsService',
      'playerTranscriptService', 'LearnerParamsService',
      'playerPositionService', 'explorationRecommendationsService',
      'StatsReportingService',
      function(
          $scope, $timeout, $rootScope, $window, messengerService,
          oppiaPlayerService, urlService, focusService,
          LearnerViewRatingService, windowDimensionsService,
          playerTranscriptService, LearnerParamsService,
          playerPositionService, explorationRecommendationsService,
          StatsReportingService) {
        $scope.CONTINUE_BUTTON_FOCUS_LABEL = 'continueButton';
        // The exploration domain object.
        $scope.exploration = null;

        // The minimum width, in pixels, needed to be able to show two cards
        // side-by-side.
        var TWO_CARD_THRESHOLD_PX = 1120;
        var TIME_PADDING_MSEC = 250;
        var TIME_SCROLL_MSEC = 600;
        var MIN_CARD_LOADING_DELAY_MSEC = 950;
        var CONTENT_FOCUS_LABEL_PREFIX = 'content-focus-label-';

        var hasInteractedAtLeastOnce = false;
        var _answerIsBeingProcessed = false;
        var _nextFocusLabel = null;

        $scope.isInPreviewMode = oppiaPlayerService.isInPreviewMode();
        $scope.isIframed = urlService.isIframed();
        $rootScope.loadingMessage = 'Loading';
        $scope.hasFullyLoaded = false;
        $scope.recommendedExplorationSummaries = [];

        $scope.OPPIA_AVATAR_IMAGE_URL = '/images/avatar/oppia_black_72px.png';

        $scope.activeCard = null;
        $scope.numProgressDots = 0;
        $scope.arePreviousResponsesShown = false;

        $scope.upcomingStateName = null;
        $scope.upcomingContentHtml = null;
        $scope.upcomingInlineInteractionHtml = null;

        $scope.panels = [];
        $scope.PANEL_TUTOR = 'tutor';
        $scope.PANEL_SUPPLEMENTAL = 'supplemental';

        $scope.helpCardHtml = null;
        $scope.helpCardHasContinueButton = false;

        $scope.profilePicture = '/images/avatar/user_blue_72px.png';
        oppiaPlayerService.getUserProfileImage().then(function(result) {
          $scope.profilePicture = result;
        });

        $scope.clearHelpCard = function() {
          $scope.helpCardHtml = null;
          $scope.helpCardHasContinueButton = false;
        };

        $scope.getContentFocusLabel = function(index) {
          return CONTENT_FOCUS_LABEL_PREFIX + index;
        };

        // If the exploration is iframed, send data to its parent about its
        // height so that the parent can be resized as necessary.
        $scope.lastRequestedHeight = 0;
        $scope.lastRequestedScroll = false;
        $scope.adjustPageHeight = function(scroll, callback) {
          $timeout(function() {
            var newHeight = document.body.scrollHeight;
            if (Math.abs($scope.lastRequestedHeight - newHeight) > 50.5 ||
                (scroll && !$scope.lastRequestedScroll)) {
              // Sometimes setting iframe height to the exact content height
              // still produces scrollbar, so adding 50 extra px.
              newHeight += 50;
              messengerService.sendMessage(messengerService.HEIGHT_CHANGE, {
                height: newHeight,
                scroll: scroll
              });
              $scope.lastRequestedHeight = newHeight;
              $scope.lastRequestedScroll = scroll;
            }

            if (callback) {
              callback();
            }
          }, 100);
        };

        $scope.getThumbnailSrc = function(panelName) {
          if (panelName === $scope.PANEL_TUTOR) {
            return $scope.OPPIA_AVATAR_IMAGE_URL;
          } else if (panelName === $scope.PANEL_SUPPLEMENTAL) {
            return $scope.exploration.getInteractionThumbnailSrc(
              $scope.activeCard.stateName);
          } else {
            throw Error(
              'Found a panel not corresponding to a tutor or interaction: ' +
              panelName);
          }
        };

        $scope.isOnTerminalCard = function() {
          return $scope.activeCard &&
            $scope.exploration.isStateTerminal($scope.activeCard.stateName);
        };

        var isSupplementalCardNonempty = function(card) {
          return !$scope.exploration.isInteractionInline(card.stateName);
        };

        $scope.isCurrentSupplementalCardNonempty = function() {
          return $scope.activeCard && isSupplementalCardNonempty(
            $scope.activeCard);
        };

        var _recomputeAndResetPanels = function() {
          $scope.clearHelpCard();

          $scope.panels = [];
          if (!$scope.canWindowFitTwoCards()) {
            $scope.panels.push($scope.PANEL_TUTOR);
          }
          if ($scope.isCurrentSupplementalCardNonempty()) {
            $scope.panels.push($scope.PANEL_SUPPLEMENTAL);
          }
          $scope.resetVisiblePanel();
        };

        $scope.currentVisiblePanelName = null;

        $scope.isPanelVisible = function(panelName) {
          if (panelName === $scope.PANEL_TUTOR &&
              $scope.canWindowFitTwoCards()) {
            return true;
          } else {
            return panelName == $scope.currentVisiblePanelName;
          }
        };

        $scope.setVisiblePanel = function(panelName) {
          $scope.currentVisiblePanelName = panelName;
          if (panelName === $scope.PANEL_TUTOR) {
            $scope.clearHelpCard();
          }
          if (panelName === $scope.PANEL_SUPPLEMENTAL) {
            $scope.$broadcast('showInteraction');
          }
        };

        $scope.resetVisiblePanel = function() {
          if ($scope.panels.length === 0) {
            $scope.currentVisiblePanelName = null;
          } else {
            $scope.currentVisiblePanelName = $scope.panels[0];
          }
        };

        // Navigates to the currently-active card, and resets the 'show previous
        // responses' setting.
        var _navigateToActiveCard = function() {
          var index = playerPositionService.getActiveCardIndex();
          $scope.activeCard = playerTranscriptService.getCard(index);
          $scope.arePreviousResponsesShown = false;
          $scope.clearHelpCard();

          _recomputeAndResetPanels();
          if (_nextFocusLabel && playerTranscriptService.isLastCard(index)) {
            focusService.setFocusIfOnDesktop(_nextFocusLabel);
          } else {
            focusService.setFocusIfOnDesktop(
              $scope.getContentFocusLabel(index));
          }
        };

        var animateToTwoCards = function(doneCallback) {
          $scope.isAnimatingToTwoCards = true;
          $timeout(function() {
            $scope.isAnimatingToTwoCards = false;
            if (doneCallback) {
              doneCallback();
            }
          }, TIME_NUM_CARDS_CHANGE_MSEC + TIME_FADEIN_MSEC + TIME_PADDING_MSEC);
        };

        var animateToOneCard = function(doneCallback) {
          $scope.isAnimatingToOneCard = true;
          $timeout(function() {
            $scope.isAnimatingToOneCard = false;
            if (doneCallback) {
              doneCallback();
            }
          }, TIME_NUM_CARDS_CHANGE_MSEC + TIME_FADEIN_MSEC + TIME_PADDING_MSEC);
        };

        $scope.isCurrentCardAtEndOfTranscript = function() {
          return playerTranscriptService.isLastCard(
            playerPositionService.getActiveCardIndex());
        };

        var _addNewCard = function(
            stateName, newParams, contentHtml, interactionHtml) {
          playerTranscriptService.addNewCard(
            stateName, newParams, contentHtml, interactionHtml);

          if (newParams) {
            LearnerParamsService.init(newParams);
          }

          $scope.numProgressDots++;

          var totalNumCards = playerTranscriptService.getNumCards();

          var previousSupplementalCardIsNonempty = (
            totalNumCards > 1 &&
            isSupplementalCardNonempty(
              playerTranscriptService.getCard(totalNumCards - 2)));
          var nextSupplementalCardIsNonempty = isSupplementalCardNonempty(
            playerTranscriptService.getLastCard());

          if (totalNumCards > 1 && $scope.canWindowFitTwoCards() &&
              !previousSupplementalCardIsNonempty &&
              nextSupplementalCardIsNonempty) {
            animateToTwoCards(function() {
              playerPositionService.setActiveCardIndex(
                $scope.numProgressDots - 1);
            });
          } else if (
              totalNumCards > 1 && $scope.canWindowFitTwoCards() &&
              previousSupplementalCardIsNonempty &&
              !nextSupplementalCardIsNonempty) {
            animateToOneCard(function() {
              playerPositionService.setActiveCardIndex(
                $scope.numProgressDots - 1);
            });
          } else {
            playerPositionService.setActiveCardIndex(
              $scope.numProgressDots - 1);
          }

          if ($scope.exploration.isStateTerminal(stateName)) {
            explorationRecommendationsService.getRecommendedSummaryDicts(
              $scope.exploration.getAuthorRecommendedExpIds(stateName),
              function(summaries) {
                $scope.recommendedExplorationSummaries = summaries;
              });
          }
        };

        $scope.toggleShowPreviousResponses = function() {
          $scope.arePreviousResponsesShown = !$scope.arePreviousResponsesShown;
        };

        $scope.initializePage = function() {
          $scope.waitingForOppiaFeedback = false;
          hasInteractedAtLeastOnce = false;
          $scope.recommendedExplorationSummaries = [];

          playerPositionService.init(_navigateToActiveCard);
          oppiaPlayerService.init(function(exploration, initHtml, newParams) {
            $scope.exploration = exploration;

            $scope.isLoggedIn = oppiaPlayerService.isLoggedIn();
            _nextFocusLabel = focusService.generateFocusLabel();

            _addNewCard(
              exploration.initStateName,
              newParams,
              initHtml,
              oppiaPlayerService.getInteractionHtml(
                exploration.initStateName, _nextFocusLabel));
            $rootScope.loadingMessage = '';
            $scope.hasFullyLoaded = true;

            $scope.adjustPageHeight(false, null);
            $window.scrollTo(0, 0);
            focusService.setFocusIfOnDesktop(_nextFocusLabel);
          });
        };

        $scope.submitAnswer = function(answer, interactionRulesService) {
          // For some reason, answers are getting submitted twice when the
          // submit button is clicked. This guards against that.
          if (_answerIsBeingProcessed ||
              !$scope.isCurrentCardAtEndOfTranscript() ||
              $scope.activeCard.destStateName) {
            return;
          }

          $scope.clearHelpCard();

          _answerIsBeingProcessed = true;
          hasInteractedAtLeastOnce = true;
          $scope.waitingForOppiaFeedback = true;

          var _oldStateName = playerTranscriptService.getLastCard().stateName;
          playerTranscriptService.addNewAnswer(answer);

          var timeAtServerCall = new Date().getTime();

          oppiaPlayerService.submitAnswer(
            answer, interactionRulesService, function(
                newStateName, refreshInteraction, feedbackHtml, contentHtml,
                newParams) {
              // Do not wait if the interaction is supplemental -- there's
              // already a delay bringing in the help card.
              var millisecsLeftToWait = (
                !$scope.exploration.isInteractionInline(_oldStateName) ? 1.0 :
                Math.max(MIN_CARD_LOADING_DELAY_MSEC - (
                  new Date().getTime() - timeAtServerCall),
                1.0));

              $timeout(function() {
                $scope.waitingForOppiaFeedback = false;
                var pairs = (
                  playerTranscriptService.getLastCard().answerFeedbackPairs);
                var lastAnswerFeedbackPair = pairs[pairs.length - 1];

                if (_oldStateName === newStateName) {
                  // Stay on the same card.
                  playerTranscriptService.addNewFeedback(feedbackHtml);
                  if (feedbackHtml &&
                      !$scope.exploration.isInteractionInline(
                        $scope.activeCard.stateName)) {
                    $scope.helpCardHtml = feedbackHtml;
                  }
                  if (refreshInteraction) {
                    // Replace the previous interaction with another of the
                    // same type.
                    _nextFocusLabel = focusService.generateFocusLabel();
                    playerTranscriptService.updateLatestInteractionHtml(
                      oppiaPlayerService.getInteractionHtml(
                        newStateName, _nextFocusLabel) +
                      oppiaPlayerService.getRandomSuffix());
                  }
                  focusService.setFocusIfOnDesktop(_nextFocusLabel);
                  scrollToBottom();
                } else {
                  // There is a new card. If there is no feedback, move on
                  // immediately. Otherwise, give the learner a chance to read
                  // the feedback, and display a 'Continue' button.

                  _nextFocusLabel = focusService.generateFocusLabel();

                  playerTranscriptService.setDestination(newStateName);

                  // These are used to compute the dimensions for the next card.
                  $scope.upcomingStateName = newStateName;
                  $scope.upcomingParams = newParams;
                  $scope.upcomingContentHtml = (
                    contentHtml + oppiaPlayerService.getRandomSuffix());
                  var _isNextInteractionInline = (
                    $scope.exploration.isInteractionInline(newStateName));
                  $scope.upcomingInlineInteractionHtml = (
                    _isNextInteractionInline ?
                    oppiaPlayerService.getInteractionHtml(
                      newStateName, _nextFocusLabel
                    ) + oppiaPlayerService.getRandomSuffix() : '');

                  if (feedbackHtml) {
                    playerTranscriptService.addNewFeedback(feedbackHtml);

                    if (!$scope.exploration.isInteractionInline(
                          $scope.activeCard.stateName)) {
                      $scope.helpCardHtml = feedbackHtml;
                      $scope.helpCardHasContinueButton = true;
                    }

                    _nextFocusLabel = $scope.CONTINUE_BUTTON_FOCUS_LABEL;
                    focusService.setFocusIfOnDesktop(_nextFocusLabel);
                    scrollToBottom();
                  } else {
                    playerTranscriptService.addNewFeedback(feedbackHtml);
                    $scope.showPendingCard(
                      newStateName,
                      newParams,
                      contentHtml + oppiaPlayerService.getRandomSuffix());
                  }
                }

                _answerIsBeingProcessed = false;
              }, millisecsLeftToWait);
            }
          );
        };
        $scope.startCardChangeAnimation = false;
        $scope.showPendingCard = function(
            newStateName, newParams, newContentHtml) {
          $scope.startCardChangeAnimation = true;

          $timeout(function() {
            _addNewCard(
              newStateName,
              newParams,
              newContentHtml,
              oppiaPlayerService.getInteractionHtml(
                newStateName, _nextFocusLabel
              ) + oppiaPlayerService.getRandomSuffix());

            $scope.upcomingStateName = null;
            $scope.upcomingParams = null;
            $scope.upcomingContentHtml = null;
            $scope.upcomingInlineInteractionHtml = null;
          }, TIME_FADEOUT_MSEC + 0.1 * TIME_HEIGHT_CHANGE_MSEC);

          $timeout(function() {
            focusService.setFocusIfOnDesktop(_nextFocusLabel);
            scrollToTop();
          },
          TIME_FADEOUT_MSEC + TIME_HEIGHT_CHANGE_MSEC + 0.5 * TIME_FADEIN_MSEC);

          $timeout(function() {
            $scope.startCardChangeAnimation = false;
          },
          TIME_FADEOUT_MSEC + TIME_HEIGHT_CHANGE_MSEC + TIME_FADEIN_MSEC +
          TIME_PADDING_MSEC);
        };

        var scrollToBottom = function() {
          $timeout(function() {
            var tutorCard = $('.conversation-skin-tutor-card-active');
            var tutorCardBottom = (
              tutorCard.offset().top + tutorCard.outerHeight());
            if ($(window).scrollTop() + $(window).height() < tutorCardBottom) {
              $('html, body').animate({
                scrollTop: tutorCardBottom - $(window).height() + 12
              }, {
                duration: TIME_SCROLL_MSEC,
                easing: 'easeOutQuad'
              });
            }
          }, 100);
        };

        var scrollToTop = function() {
          $timeout(function() {
            $('html, body').animate({
              scrollTop: 0
            }, 800, 'easeOutQuart');
            return false;
          });
        };

        $scope.submitUserRating = function(ratingValue) {
          LearnerViewRatingService.submitUserRating(ratingValue);
        };
        $scope.$on('ratingUpdated', function() {
          $scope.userRating = LearnerViewRatingService.getUserRating();
        });

        $window.addEventListener('beforeunload', function(e) {
          if (hasInteractedAtLeastOnce && !$scope.isInPreviewMode &&
              !$scope.exploration.isStateTerminal(
                playerTranscriptService.getLastCard().stateName)) {
            StatsReportingService.recordMaybeLeaveEvent(
              playerTranscriptService.getLastStateName(),
              LearnerParamsService.getAllParams());
            var confirmationMessage = (
              'If you navigate away from this page, your progress on the ' +
              'exploration will be lost.');
            (e || $window.event).returnValue = confirmationMessage;
            return confirmationMessage;
          }
        });

        $scope.windowWidth = windowDimensionsService.getWidth();
        $window.onresize = function() {
          $scope.adjustPageHeight(false, null);
          $scope.windowWidth = windowDimensionsService.getWidth();
          _recomputeAndResetPanels();
        };

        $window.addEventListener('scroll', function() {
          fadeDotsOnScroll();
          fixSupplementOnScroll();
        });

        var fadeDotsOnScroll = function() {
          var progressDots = $('.conversation-skin-progress-dots');
          var progressDotsTop = progressDots.height();
          var newOpacity = Math.max(
            (progressDotsTop - $(window).scrollTop()) / progressDotsTop, 0);
          progressDots.css({
            opacity: newOpacity
          });
        };

        var fixSupplementOnScroll = function() {
          var supplementCard = $('div.conversation-skin-supplemental-card');
          var topMargin = $('.navbar-container').height() - 20;
          if ($(window).scrollTop() > topMargin) {
            supplementCard.addClass(
              'conversation-skin-supplemental-card-fixed');
          } else {
            supplementCard.removeClass(
              'conversation-skin-supplemental-card-fixed');
          }
        };

        $scope.canWindowFitTwoCards = function() {
          return $scope.windowWidth >= TWO_CARD_THRESHOLD_PX;
        };

        $scope.initializePage();
        LearnerViewRatingService.init(function(userRating) {
          $scope.userRating = userRating;
        });

        $scope.collectionId = GLOBALS.collectionId;
        $scope.collectionTitle = GLOBALS.collectionTitle;
      }
    ]
  };
}]);
