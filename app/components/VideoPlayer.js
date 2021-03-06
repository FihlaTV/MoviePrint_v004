/* eslint no-param-reassign: "error" */

import React, { Component, Fragment } from 'react';
import PropTypes from 'prop-types';
import { Icon, Popup } from 'semantic-ui-react';
import uuidV4 from 'uuid/v4';
import log from 'electron-log';
import { changeThumb, addIntervalSheet, addThumb } from '../actions';
import VideoCaptureProperties from '../utils/videoCaptureProperties';
import {
  MINIMUM_WIDTH_OF_CUTWIDTH_ON_TIMELINE,
  MOVIEPRINT_COLORS,
  VIDEOPLAYER_SLICE_ARRAY_SIZE,
  CHANGE_THUMB_STEP,
  SHEET_VIEW,
  SHEET_TYPE,
} from '../utils/constants';
import {
  frameCountToTimeCode,
  secondsToFrameCount,
  frameCountToSeconds,
  getHighestFrame,
  getLowestFrame,
  getSceneFromFrameNumber,
  getPreviousThumb,
  getNextThumb,
  getSliceWidthArrayForCut,
  getVisibleThumbs,
  limitRange,
  mapRange,
  setPosition,
} from '../utils/utils';
import styles from './VideoPlayer.css';
import stylesPop from './Popup.css';

const pathModule = require('path');
const opencv = require('opencv4nodejs');

class VideoPlayer extends Component {
  constructor(props) {
    super(props);

    this.state = {
      currentFrame: 0, // in frames
      currentScene: {
        start: 0,
        length: 0
      }, // in frames
      videoHeight: 360,
      videoWidth: 640,
      playHeadPosition: 0, // in pixel
      currentTime: 0, // in seconds
      duration: 0, // in seconds
      mouseStartDragInsideTimeline: false,
      showPlaybar: true,
      loadVideo: false,
      showHTML5Player: false,
    };

    // this.onSaveThumbClick = this.onSaveThumbClick.bind(this);

    this.handleKeyPress = this.handleKeyPress.bind(this);

    this.getCurrentFrameNumber = this.getCurrentFrameNumber.bind(this);
    this.onBackForwardClick = this.onBackForwardClick.bind(this);
    this.updateOpencvVideoCanvas = this.updateOpencvVideoCanvas.bind(this);
    this.updatePositionWithStep = this.updatePositionWithStep.bind(this);
    this.onDurationChange = this.onDurationChange.bind(this);
    this.updateTimeFromFrameNumber = this.updateTimeFromFrameNumber.bind(this);
    this.updatePositionFromTime = this.updatePositionFromTime.bind(this);
    this.updatePositionFromFrame = this.updatePositionFromFrame.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onLoadedData = this.onLoadedData.bind(this);
    this.toggleHTML5Player = this.toggleHTML5Player.bind(this);

    this.onTimelineClick = this.onTimelineClick.bind(this);
    this.onTimelineDrag = this.onTimelineDrag.bind(this);
    this.onTimelineDragStop = this.onTimelineDragStop.bind(this);
    this.onTimelineMouseOver = this.onTimelineMouseOver.bind(this);
    this.onTimelineExit = this.onTimelineExit.bind(this);
    this.onNextSceneClickWithStop = this.onNextSceneClickWithStop.bind(this);
    this.onNextThumbClickWithStop = this.onNextThumbClickWithStop.bind(this);
    this.onMergeSceneClickWithStop = this.onMergeSceneClickWithStop.bind(this);
    this.onCutSceneClickWithStop = this.onCutSceneClickWithStop.bind(this);
    this.setOrToggleDefaultSheetViewWithStop = this.setOrToggleDefaultSheetViewWithStop.bind(this);
    this.onChangeThumbClick = this.onChangeThumbClick.bind(this);
    this.onChangeOrAddClick = this.onChangeOrAddClick.bind(this);
  }

  componentWillMount() {
    const { aspectRatioInv, height, controllerHeight } = this.props;
    const videoHeight = parseInt(height - controllerHeight, 10);
    const videoWidth = videoHeight / aspectRatioInv;
    this.setState({
      videoHeight,
      videoWidth,
      loadVideo: true,
    });
  }

  componentDidMount() {
    const { jumpToFrameNumber, scenes } = this.props;
    if (jumpToFrameNumber !== undefined) {
      this.updateTimeFromFrameNumber(jumpToFrameNumber);
    }
    document.addEventListener('keydown', this.handleKeyPress);
  }

  componentDidUpdate(prevProps, prevState) {
    const { aspectRatioInv, controllerHeight, defaultSheetView, file, height, jumpToFrameNumber, opencvVideo, scenes, width} = this.props;
    const { currentFrame, currentScene, videoHeight } = this.state;

    // update videoHeight if window size changed
    if (
      prevProps.aspectRatioInv !== aspectRatioInv ||
      prevProps.height !== height ||
      prevProps.width !== width
    ) {
      const videoHeight = parseInt(height - controllerHeight, 10);
      const videoWidth = videoHeight / aspectRatioInv;
      this.setState({
        videoHeight,
        videoWidth,
      });
    }

    if (jumpToFrameNumber !== undefined) {
      if (prevProps.jumpToFrameNumber !== jumpToFrameNumber) {
        this.updateTimeFromFrameNumber(jumpToFrameNumber);
      }
    }

    if (
      prevProps.scenes.length !== scenes.length ||
      (prevProps.opencvVideo !== undefined && opencvVideo !== undefined &&
        (prevProps.opencvVideo.get(VideoCaptureProperties.CAP_PROP_FRAME_COUNT) !== opencvVideo.get(VideoCaptureProperties.CAP_PROP_FRAME_COUNT))) ||
      prevState.videoHeight !== videoHeight
    ) {
      this.updateTimeFromFrameNumber(currentFrame);
    }
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyPress);
  }

  handleKeyPress(event) {
    // you may also add a filter here to skip keys, that do not have an effect for your app
    // this.props.keyPressAction(event.keyCode);
    event.stopPropagation();

    const { arrayOfCuts, onCutSceneClick, onMergeSceneClick, sheetType, defaultSheetView } = this.props;
    const { currentFrame } = this.state;
    const thisFrameIsACut = arrayOfCuts.some(item => item === currentFrame);
    // only listen to key events when feedback form is not shown
    if (event.target.tagName !== 'INPUT') {
      let stepValue = 1;
      const [stepValue0, stepValue1, stepValue2] = CHANGE_THUMB_STEP;
      if (event) {
        switch (event.which) {
          case 13: // press enter
            if (defaultSheetView === SHEET_VIEW.TIMELINEVIEW) {
              if (thisFrameIsACut) {
                log.debug(`merging scenes at ${currentFrame}`)
                onMergeSceneClick(currentFrame);
              } else {
                log.debug(`cutting scene at ${currentFrame}`)
                onCutSceneClick(currentFrame);
              }
            }
            if (sheetType === SHEET_TYPE.SCENES && defaultSheetView === SHEET_VIEW.GRIDVIEW) {
              this.onChangeThumbClick();
            }
            if (sheetType === SHEET_TYPE.INTERVAL && defaultSheetView === SHEET_VIEW.GRIDVIEW) {
              this.onChangeOrAddClick();
            }
            break;
          case 37: // press arrow left
            stepValue = stepValue1 * -1;
            if (event.shiftKey) {
              stepValue = stepValue0 * -1;
            }
            if (event.altKey) {
              stepValue = stepValue2 * -1;
            }
            if (event.shiftKey && event.altKey) {
              if (defaultSheetView === SHEET_VIEW.TIMELINEVIEW) {
                this.onNextSceneClickWithStop(undefined, 'back', currentFrame);
              } else {
                this.onNextThumbClickWithStop(undefined, 'back', currentFrame);
              }
            } else {
              this.updatePositionWithStep(stepValue);
            }
            break;
          case 39: // press arrow right
            stepValue = stepValue1 * 1;
            if (event.shiftKey) {
              stepValue = stepValue0 * 1;
            }
            if (event.altKey) {
              stepValue = stepValue2 * 1;
            }
            if (event.shiftKey && event.altKey) {
              if (defaultSheetView === SHEET_VIEW.TIMELINEVIEW) {
                this.onNextSceneClickWithStop(undefined, 'forward', currentFrame);
              } else {
                this.onNextThumbClickWithStop(undefined, 'forward', currentFrame);
              }
            } else {
              this.updatePositionWithStep(stepValue);
            }
            break;
          default:
        }
      }
    }
  }


  getCurrentFrameNumber() {
    let newFrameNumber;
    newFrameNumber = this.state.currentFrame;
    return newFrameNumber
  }

  onBackForwardClick(e, step) {
    e.target.blur(); // remove focus so button gets not triggered when clicking enter
    e.stopPropagation();
    this.updatePositionWithStep(step);
  }

  onDurationChange(duration) {
    // setState is asynchronious
    // updatePosition needs to wait for setState, therefore it is put into callback of setState
    this.setState({ duration }, () => {
      this.updateTimeFromPosition(this.state.playHeadPosition);
    });
  }

  updateOpencvVideoCanvas(currentFrame) {
    const { arrayOfCuts, containerWidth, file, opencvVideo, defaultSheetView } = this.props;
    const { frameCount } = file;
    // offset currentFrame due to main frame is in middle of sliceArraySize
    let offsetCorrection = 0;
    let sliceArraySize = VIDEOPLAYER_SLICE_ARRAY_SIZE;
    if (defaultSheetView === SHEET_VIEW.GRIDVIEW) {
      sliceArraySize -= 1;
      offsetCorrection = 1;
    }
    const sliceArraySizeHalf = Math.floor(sliceArraySize / 2);
    const offsetFrameNumber = currentFrame - parseInt(sliceArraySizeHalf, 10) + offsetCorrection;
    const { videoHeight } = this.state
    const vid = opencvVideo;
    setPosition(vid, offsetFrameNumber, file.useRatio);
    const ctx = this.opencvVideoPlayerCanvasRef.getContext('2d');
    const length = vid.get(VideoCaptureProperties.CAP_PROP_FRAME_COUNT);
    const height = vid.get(VideoCaptureProperties.CAP_PROP_FRAME_HEIGHT);
    const width = vid.get(VideoCaptureProperties.CAP_PROP_FRAME_WIDTH);
    const rescaleFactor = Math.abs(videoHeight / height);
    const sliceWidthArray = getSliceWidthArrayForCut(containerWidth, sliceArraySize);
    const sliceGap = 1;
    const cutGap = 8;
    this.opencvVideoPlayerCanvasRef.height = videoHeight;
    this.opencvVideoPlayerCanvasRef.width = containerWidth;
    let canvasXPos = 0;

    for (let i = 0; i < sliceArraySize; i += 1) {
      const frame = vid.read();
      const sliceWidth = sliceWidthArray[i];
      const sliceXPos = Math.max(Math.floor((width * rescaleFactor) / 2) - Math.floor(sliceWidth / 2), 0);
      const thisFrameIsACut = arrayOfCuts.some(item => item === offsetFrameNumber + i + 1);

      if ((offsetFrameNumber + i) >= 0 && !frame.empty) {
        const matResized = frame.rescale(rescaleFactor);
        const matCropped = matResized.getRegion(new opencv.Rect(
          sliceXPos,
          0,
          Math.min(matResized.cols, sliceWidth),
          Math.min(matResized.rows, Math.abs(videoHeight))
        ));

        const matRGBA = matResized.channels === 1 ?
          matCropped.cvtColor(opencv.COLOR_GRAY2RGBA) :
          matCropped.cvtColor(opencv.COLOR_BGR2RGBA);

        const imgData = new ImageData(
          new Uint8ClampedArray(matRGBA.getData()),
          matCropped.cols,
          matCropped.rows
        );
        ctx.putImageData(imgData, canvasXPos, 0);
      } else {
        console.log('frame empty')
      }
      canvasXPos += sliceWidthArray[i] + (thisFrameIsACut ? cutGap : sliceGap);
    }
  }

  updatePositionWithStep(step) {
    const { file } = this.props;
    const { currentTime, loadVideo, showHTML5Player } = this.state;
    const currentFramePlusStep = limitRange(this.getCurrentFrameNumber() + step, 0, file.frameCount - 1);
    const currentTimePlusStep = currentTime + frameCountToSeconds(step, file.fps);
    this.updatePositionFromFrame(currentFramePlusStep);
    this.updateOpencvVideoCanvas(currentFramePlusStep);
    if (loadVideo && showHTML5Player) {
      this.video.currentTime = currentTimePlusStep;
    }
  }

  updatePositionFromTime(currentTime) {
    const { containerWidth, file, onSelectThumbMethod, scenes } = this.props;
    const { currentScene, duration } = this.state;
    if (currentTime) {
      // rounds the number with 3 decimals
      const roundedCurrentTime = Math.round((currentTime * 1000) + Number.EPSILON) / 1000;
      const currentFrame = secondsToFrameCount(currentTime, file.fps);
      const xPos = mapRange(
        roundedCurrentTime,
        0, duration,
        0, containerWidth, false
      );
      this.setState({
        currentFrame,
        currentTime: roundedCurrentTime,
        playHeadPosition: xPos,
      });
      const newScene = getSceneFromFrameNumber(scenes, currentFrame);
      if (currentScene !== undefined &&
        newScene !== undefined &&
        currentScene.sceneId !== newScene.sceneId) {
        this.setState({
          currentScene: newScene,
        });
        onSelectThumbMethod(newScene.sceneId); // call to update selection when scrubbing
      }
      this.updateOpencvVideoCanvas(currentFrame);
      // log.debug(`${currentTime} : ${xPos} : ${containerWidth} : ${duration}`);
    }

   }

  updatePositionFromFrame(currentFrame) {
    const { containerWidth, file, onSelectThumbMethod, scenes } = this.props;
    const { currentScene } = this.state;

    if (currentFrame !== undefined) {
      const newScene = getSceneFromFrameNumber(scenes, currentFrame);
      if (newScene !== undefined &&
        (currentScene === undefined ||
        currentScene.sceneId !== newScene.sceneId)) {
        this.setState({
          currentScene: newScene,
        });
        onSelectThumbMethod(newScene.sceneId); // call to update selection when scrubbing
      }
      const xPos = mapRange(
        currentFrame,
        0, (file.frameCount - 1),
        0, containerWidth, false
      );
      this.setState({
        currentFrame,
        playHeadPosition: xPos,
      });
    }
  }

  updateTimeFromFrameNumber(currentFrame) {
    const { containerWidth, file, scenes } = this.props;
    const { loadVideo, showHTML5Player } = this.state;

    const currentScene = getSceneFromFrameNumber(scenes, currentFrame);
    if (currentScene !== undefined) {
      this.setState({
        currentScene,
      });
    }
    const xPos = mapRange(
      currentFrame,
      0, (file.frameCount - 1),
      0, containerWidth, false
    );
    const currentTime = frameCountToSeconds(currentFrame, file.fps);
    this.setState({
      currentFrame,
      currentTime,
      playHeadPosition: xPos,
    });
    if (loadVideo && showHTML5Player) {
      this.video.currentTime = currentTime;
    }
    this.updateOpencvVideoCanvas(currentFrame);
  }

  updateTimeFromPosition(xPos) {
    const { containerWidth, file, scenes, onSelectThumbMethod } = this.props;
    const { currentScene, duration, loadVideo, showHTML5Player } = this.state;

    if (xPos !== undefined) {
      const { frameCount } = file;
      const currentFrame = mapRange(xPos, 0, containerWidth, 0, frameCount - 1);
      const newScene = getSceneFromFrameNumber(scenes, currentFrame);
      if (currentScene !== undefined &&
        newScene !== undefined &&
        currentScene.sceneId !== newScene.sceneId) {
        this.setState({
          currentScene: newScene,
        });
        onSelectThumbMethod(newScene.sceneId); // call to update selection when scrubbing
      }
      this.setState({
        playHeadPosition: xPos,
        currentFrame,
      });
      this.updateOpencvVideoCanvas(currentFrame);
      const currentTime = mapRange(xPos, 0, containerWidth, 0, duration, false);
      // log.debug(`${currentTime} : ${xPos} : ${containerWidth} : ${duration}`);
      this.setState({ currentTime });
      if (loadVideo && showHTML5Player) {
        this.video.currentTime = currentTime;
      }
    }
  }

  onTimelineClick(e) {
    const bounds = this.timeLine.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    this.updateTimeFromPosition(x);
  }

  onTimelineDrag() {
    this.setState({ mouseStartDragInsideTimeline: true });
  }

  onTimelineMouseOver(e) {
    if (this.state.mouseStartDragInsideTimeline) { // check if dragging over timeline
      const bounds = this.timeLine.getBoundingClientRect();
      const x = e.clientX - bounds.left;
      this.updateTimeFromPosition(x);
    }
  }

  onTimelineDragStop() {
    this.setState({ mouseStartDragInsideTimeline: false });
  }

  onTimelineExit() {
    if (this.state.mouseStartDragInsideTimeline) {
      this.setState({ mouseStartDragInsideTimeline: false });
    }
  }

  onMergeSceneClickWithStop(e, currentFrame) {
    const { onMergeSceneClick } = this.props;
    e.target.blur(); // remove focus so button gets not triggered when clicking enter
    e.stopPropagation();
    onMergeSceneClick(currentFrame);
    log.debug(`Mouse click: merging scenes at ${currentFrame}`)
  }

  onCutSceneClickWithStop(e, currentFrame) {
    const { onCutSceneClick } = this.props;
    e.target.blur(); // remove focus so button gets not triggered when clicking enter
    e.stopPropagation();
    log.debug(`Mouse click: cutting scene at ${currentFrame}`)
    onCutSceneClick(currentFrame);
  }

  setOrToggleDefaultSheetViewWithStop(e) {
    const { setOrToggleDefaultSheetView } = this.props;
    e.target.blur(); // remove focus so button gets not triggered when clicking enter
    e.stopPropagation();
    setOrToggleDefaultSheetView();
  }

  onNextThumbClickWithStop(e, direction, frameNumber) {
    const { currentScene } = this.state;
    const { file, onSelectThumbMethod, scenes, selectedThumb, thumbs, sheetType } = this.props;
    if (e !== undefined) {
      e.target.blur(); // remove focus so button gets not triggered when clicking enter
      e.stopPropagation();
    }

    if (sheetType === SHEET_TYPE.SCENES) {
      let newSceneToSelect;

      if (direction === 'back') {
        newSceneToSelect = getSceneFromFrameNumber(scenes, currentScene.start - 1);
      } else if (direction === 'forward') {
        newSceneToSelect = getSceneFromFrameNumber(scenes, currentScene.start + currentScene.length);
      }
      const newThumbToSelect = thumbs.find((thumb) => thumb.thumbId === newSceneToSelect.sceneId);
      if (newSceneToSelect !== undefined) {
        onSelectThumbMethod(newSceneToSelect.sceneId); // call to update selection
      }
      if (newThumbToSelect !== undefined) {
        let newFrameNumberToJumpTo = newThumbToSelect.frameNumber;
        newFrameNumberToJumpTo = limitRange(newFrameNumberToJumpTo, 0, file.frameCount - 1);
        this.updatePositionFromFrame(newFrameNumberToJumpTo);
        this.updateOpencvVideoCanvas(newFrameNumberToJumpTo);
      }
    } else if (sheetType === SHEET_TYPE.INTERVAL) {
      if (selectedThumb !== undefined) {
        let newThumbToSelect;
        if (direction === 'back') {
          newThumbToSelect = getPreviousThumb(thumbs, selectedThumb.thumbId);
        } else if (direction === 'forward') {
          newThumbToSelect = getNextThumb(thumbs, selectedThumb.thumbId);
        }
        if (newThumbToSelect !== undefined) {
          onSelectThumbMethod(newThumbToSelect.thumbId); // call to update selection
          let newFrameNumberToJumpTo = newThumbToSelect.frameNumber;
          newFrameNumberToJumpTo = limitRange(newFrameNumberToJumpTo, 0, file.frameCount - 1);
          this.updatePositionFromFrame(newFrameNumberToJumpTo);
          this.updateOpencvVideoCanvas(newFrameNumberToJumpTo);
        }
      }
    }
  }

  onNextSceneClickWithStop(e, direction, frameNumber) {
    const { currentScene } = this.state;
    const { file, onSelectThumbMethod, scenes } = this.props;
    if (e !== undefined) {
      e.target.blur(); // remove focus so button gets not triggered when clicking enter
      e.stopPropagation();
    }

    let newFrameNumberToJumpTo;
    let newSceneToSelect;
    // if going back and frameNumber is within the scene not at the cut
    // then just update position else jumpToScene
    if (direction === 'back' && frameNumber !== currentScene.start) {
      newFrameNumberToJumpTo = currentScene.start;
    } else {
      if (direction === 'back') {
        newSceneToSelect = getSceneFromFrameNumber(scenes, currentScene.start - 1);
        newFrameNumberToJumpTo = newSceneToSelect.start;
      } else if (direction === 'forward') {
        newFrameNumberToJumpTo = currentScene.start + currentScene.length;
        newSceneToSelect = getSceneFromFrameNumber(scenes, newFrameNumberToJumpTo);
      }
      if (newSceneToSelect !== undefined) {
        onSelectThumbMethod(newSceneToSelect.sceneId); // call to update selection
      }
    }
    newFrameNumberToJumpTo = limitRange(newFrameNumberToJumpTo, 0, file.frameCount - 1);
    this.updatePositionFromFrame(newFrameNumberToJumpTo);
    this.updateOpencvVideoCanvas(newFrameNumberToJumpTo);
  }

  onChangeThumbClick() {
    const { currentFrame, currentScene } = this.state;
    const { currentSheetId, file, onChangeThumb, scenes } = this.props;

    if (currentScene !== undefined && currentFrame !== undefined) {
      onChangeThumb(file, currentSheetId, currentScene.sceneId, currentFrame);
    }
  }

  onChangeOrAddClick = () => {
    const { currentFrame } = this.state;
    const { currentSheetId, file, frameSize, keyObject, onAddThumb, onChangeThumb, onSelectThumbMethod, selectedThumb, thumbs } = this.props;

    // only do changes if there is a thumb selected
    if (thumbs.find((thumb) => thumb.thumbId === selectedThumb.thumbId) !== undefined) {
      if (keyObject.altKey || keyObject.shiftKey) {
        const newThumbId = uuidV4();
        if (keyObject.altKey) {
          onAddThumb(
            file,
            currentSheetId,
            newThumbId,
            currentFrame,
            thumbs.find((thumb) => thumb.thumbId === selectedThumb.thumbId).index + 1,
            frameSize,
          );
        } else { // if shiftKey
          onAddThumb(
            file,
            currentSheetId,
            newThumbId,
            currentFrame,
            thumbs.find((thumb) => thumb.thumbId === selectedThumb.thumbId).index,
            frameSize,
          );
        }
        // delay selection so it waits for add thumb to be ready
        setTimeout(() => {
          onSelectThumbMethod(newThumbId, currentFrame);
        }, 500);
      } else { // if normal set new thumb
        onChangeThumb(file, currentSheetId, selectedThumb.thumbId, currentFrame, frameSize);
      }
    }
  }

  toggleHTML5Player(e) {
    e.target.blur(); // remove focus so button gets not triggered when clicking enter
    e.stopPropagation();
    this.setState(prevState => ({
      showHTML5Player: !prevState.showHTML5Player
    }));
  }

  onVideoError = () => {
    log.error('onVideoError');
    // log.debug(this);
    this.onDurationChange(frameCountToSeconds(this.props.file.frameCount));
    this.setState({
      loadVideo: false
    });
  }

  onLoadedData = () => {
    // log.debug('onLoadedData');
    // log.debug(this);
    this.setState({
      loadVideo: true
    });
  }

  render() {
    const { currentFrame, currentScene, playHeadPosition } = this.state;
    const { arrayOfCuts, containerWidth, file, keyObject, scaleValueObject, selectedThumb, sheetType, defaultSheetView, thumbs } = this.props;
    const { showHTML5Player, showPlaybar, videoHeight, videoWidth } = this.state;

    function over(event) {
      event.target.style.opacity = 1;
    }

    function out(event) {
      event.target.style.opacity = 0.5;
    }

    const inPoint = currentScene !== undefined ? currentScene.start : 0;
    const outPoint = currentScene !== undefined ? currentScene.start + currentScene.length : 0;
    const inPointPositionOnTimeline =
      ((containerWidth * 1.0) / file.frameCount) * inPoint;
    const outPointPositionOnTimeline =
      ((containerWidth * 1.0) / file.frameCount) * outPoint;
    const cutWidthOnTimeLine = Math.max(
      outPointPositionOnTimeline - inPointPositionOnTimeline,
      MINIMUM_WIDTH_OF_CUTWIDTH_ON_TIMELINE
    );

    const thisFrameIsACut = arrayOfCuts.some(item => item === currentFrame);

    return (
      <div>
        <div
          className={`${styles.player}`}
          style={{
            // height: videoHeight,
            width: containerWidth,
          }}
        >
          <Popup
            trigger={
              <button
                type='button'
                className={`${styles.hoverButton} ${styles.textButton} ${styles.html5Button}`}
                onClick={(e) => this.toggleHTML5Player(e)}
                onMouseOver={over}
                onMouseLeave={out}
                onFocus={over}
                onBlur={out}
              >
                html5 player
              </button>
            }
            className={stylesPop.popup}
            content={ showHTML5Player ? 'Hide HTML5 Player' : 'Show HTML5 Player'}
          />
          {showHTML5Player &&
            <Fragment>
              <div
                className={`${styles.noVideoText}`}
              >
                The video format is not supported by this player
              </div>
              <video
              ref={(el) => { this.video = el; }}
              className={`${styles.videoOverlay}`}
              controls={showPlaybar ? true : undefined}
              muted
              src={file ? `${pathModule.dirname(file.path)}/${encodeURIComponent(pathModule.basename(file.path))}` || '' : ''}
              width={videoWidth}
              height={videoHeight}
              onDurationChange={e => this.onDurationChange(e.target.duration)}
              onTimeUpdate={e => this.updatePositionFromTime(e.target.currentTime)}
              onLoadedData={this.onLoadedData}
              onError={this.onVideoError}
              >
              <track kind="captions" />
              </video>
            </Fragment>
          }
          <canvas ref={(el) => { this.opencvVideoPlayerCanvasRef = el; }} />
          <div
            id="currentTimeDisplay"
            className={`${styles.frameNumberOrTimeCode} ${styles.moveToMiddle}`}
          >
            {this.state.currentFrame}
          </div>
        </div>
        <div className={`${styles.controlsWrapper}`}>
          <div
            id="timeLine"
            className={`${styles.timelineWrapper}`}
            onClick={this.onTimelineClick}
            onMouseDown={this.onTimelineDrag}
            onMouseUp={this.onTimelineDragStop}
            onMouseMove={this.onTimelineMouseOver}
            onMouseLeave={this.onTimelineExit}
            ref={(el) => { this.timeLine = el; }}
          >
            <div
              className={`${styles.timelinePlayhead}`}
              style={{
                left: Number.isNaN(playHeadPosition) ? 0 : playHeadPosition,
              }}
            />
            {sheetType === SHEET_TYPE.SCENES && <div
              className={`${styles.timelineCut}`}
              style={{
                left: Number.isNaN(inPointPositionOnTimeline) ? 0 : inPointPositionOnTimeline,
                width: Number.isNaN(cutWidthOnTimeLine) ? 0 : cutWidthOnTimeLine,
              }}
            />}
          </div>
          {(sheetType === SHEET_TYPE.SCENES ||
            defaultSheetView === SHEET_VIEW.GRIDVIEW) &&
            <div className={`${styles.buttonWrapper}`}>
              {sheetType === SHEET_TYPE.SCENES && <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.changeModeButton}`}
                    onClick={(e) => this.setOrToggleDefaultSheetViewWithStop(e)}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                  >
                    mode
                  </button>
                }
                className={stylesPop.popup}
                content={<span>Switch between cut/merge scenes and change thumb mode <mark>SPACE</mark></span>}
              />}
              {defaultSheetView === SHEET_VIEW.TIMELINEVIEW && <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.previousScene}`}
                    onClick={(e) => this.onNextSceneClickWithStop(e, 'back', this.state.currentFrame)}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                  >
                    previous cut
                  </button>
                }
                className={stylesPop.popup}
                content={<span>Jump to previous cut <mark>SHIFT + ALT + Arrow left</mark></span>}
              />}
              {((defaultSheetView === SHEET_VIEW.GRIDVIEW && sheetType === SHEET_TYPE.SCENES) ||
                (defaultSheetView === SHEET_VIEW.GRIDVIEW && selectedThumb !== undefined)) &&
                <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.previousScene}`}
                    onClick={(e) => this.onNextThumbClickWithStop(e, 'back', this.state.currentFrame)}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                  >
                    previous thumb
                  </button>
                }
                className={stylesPop.popup}
                content={<span>Jump to previous thumb <mark>SHIFT + ALT + Arrow left</mark></span>}
              />}
              <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.hundredFramesBack}`}
                    onClick={(e) => this.onBackForwardClick(e, -100)}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                  >
                    {'<<<'}
                  </button>
                }
                className={stylesPop.popup}
                content={<span>Move 100 frames back <mark>ALT + Arrow left</mark></span>}
              />
              <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.tenFramesBack}`}
                    onClick={(e) => this.onBackForwardClick(e, -10)}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                  >
                    {'<<'}
                  </button>
                }
                className={stylesPop.popup}
                content={<span>Move 10 frames back <mark>Arrow left</mark></span>}
              />
              <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.oneFrameBack}`}
                    onClick={(e) => this.onBackForwardClick(e, -1)}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                  >
                    {'<'}
                  </button>
                }
                className={stylesPop.popup}
                content={<span>Move 1 frame back <mark>SHIFT + Arrow left</mark></span>}
              />
              {sheetType === SHEET_TYPE.SCENES && defaultSheetView === SHEET_VIEW.TIMELINEVIEW && currentFrame !== 0 && <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.cutMergeButton}`}
                    onClick={thisFrameIsACut ?
                      (e) => this.onMergeSceneClickWithStop(e, currentFrame) :
                      (e) => this.onCutSceneClickWithStop(e, currentFrame)}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                    style={{
                      color: MOVIEPRINT_COLORS[0]
                    }}
                  >
                    {thisFrameIsACut ? 'MERGE' : 'CUT'}
                  </button>
                }
                className={stylesPop.popup}
                content={thisFrameIsACut ? (<span>Merge scenes <mark>ENTER</mark></span>) : (<span>Cut scene <mark>ENTER</mark></span>)}
              />}
              {sheetType === SHEET_TYPE.SCENES && defaultSheetView === SHEET_VIEW.GRIDVIEW && currentFrame !== 0 && <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.cutMergeButton}`}
                    onClick={this.onChangeThumbClick}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                    style={{
                      color: MOVIEPRINT_COLORS[0]
                    }}
                  >
                    CHANGE
                  </button>
                }
                className={stylesPop.popup}
                content={<span>Change the thumb to use this frame <mark>ENTER</mark></span>}
              />}
              {sheetType === SHEET_TYPE.INTERVAL && <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.cutMergeButton}`}
                    onClick={this.onChangeOrAddClick}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                    style={{
                      color: MOVIEPRINT_COLORS[0]
                    }}
                  >
                    {keyObject.altKey ? 'ADD AFTER' : (keyObject.shiftKey ? 'ADD BEFORE' : 'CHANGE')}
                  </button>
                }
                className={stylesPop.popup}
                content={keyObject.altKey ? (<span>Add a new thumb <mark>after</mark> selection</span>) : (keyObject.shiftKey ? (<span>Add a new thumb <mark>before</mark> selection</span>) : (<span>Change the thumb to use this frame <mark>ENTER</mark> | with <mark>SHIFT</mark> add a thumb before selection | with <mark>ALT</mark> add a thumb after selection</span>))}
              />}
              <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.oneFrameForward}`}
                    onClick={(e) => this.onBackForwardClick(e, 1)}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                  >
                    {'>'}
                  </button>
                }
                className={stylesPop.popup}
                content={<span>Move 1 frame forward <mark>SHIFT + Arrow right</mark></span>}
              />
              <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.tenFramesForward}`}
                    onClick={(e) => this.onBackForwardClick(e, 10)}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                  >
                    {'>>'}
                  </button>
                }
                className={stylesPop.popup}
                content={<span>Move 10 frames forward<mark>Arrow right</mark></span>}
              />
              <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.hundredFramesForward}`}
                    onClick={(e) => this.onBackForwardClick(e, 100)}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                  >
                    {'>>>'}
                  </button>
                }
                className={stylesPop.popup}
                content={<span>Move 100 frames forward <mark>ALT + Arrow right</mark></span>}
              />
              {((defaultSheetView === SHEET_VIEW.GRIDVIEW && sheetType === SHEET_TYPE.SCENES) ||
                (defaultSheetView === SHEET_VIEW.GRIDVIEW && selectedThumb !== undefined)) &&
                <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.nextScene}`}
                    onClick={(e) => this.onNextThumbClickWithStop(e, 'forward', this.state.currentFrame)}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                  >
                    next thumb
                  </button>
                }
                className={stylesPop.popup}
                content={<span>Jump to next thumb <mark>SHIFT + ALT + Arrow right</mark></span>}
              />}
              {defaultSheetView === SHEET_VIEW.TIMELINEVIEW && <Popup
                trigger={
                  <button
                    type='button'
                    className={`${styles.hoverButton} ${styles.textButton} ${styles.nextScene}`}
                    onClick={(e) => this.onNextSceneClickWithStop(e, 'forward', this.state.currentFrame)}
                    onMouseOver={over}
                    onMouseLeave={out}
                    onFocus={over}
                    onBlur={out}
                  >
                    next cut
                  </button>
                }
                className={stylesPop.popup}
                content={<span>Jump to next cut <mark>SHIFT + ALT + Arrow right</mark></span>}
              />}
            </div>
          }
        </div>
      </div>
    );
  }
}

VideoPlayer.contextTypes = {
  thumbId: PropTypes.number,
  positionRatio: PropTypes.number,
  setNewFrame: PropTypes.func,
  closeModal: PropTypes.func,
};

VideoPlayer.defaultProps = {
  // currentFileId: undefined,
  file: {
    id: undefined,
    width: 640,
    height: 360,
    columnCount: 4,
    frameCount: 16,
    fps: 25,
    path: '',
  },
  height: 360,
  width: 640,
  thumbs: undefined,
  frameNumber: 0,
  scenes: [],
  // selectedThumbId: undefined,
};

VideoPlayer.propTypes = {
  aspectRatioInv: PropTypes.number.isRequired,
  controllerHeight: PropTypes.number.isRequired,
  file: PropTypes.shape({
    id: PropTypes.string,
    width: PropTypes.number,
    height: PropTypes.number,
    columnCount: PropTypes.number,
    frameCount: PropTypes.number,
    fps: PropTypes.number,
    path: PropTypes.string,
    useRatio: PropTypes.bool,
  }),
  height: PropTypes.number,
  frameNumber: PropTypes.number,
  // selectedThumbId: PropTypes.string,
  setOrToggleDefaultSheetView: PropTypes.func.isRequired,
  onThumbDoubleClick: PropTypes.func.isRequired,
  onChangeThumb: PropTypes.func.isRequired,
  onMergeSceneClick: PropTypes.func.isRequired,
  onCutSceneClick: PropTypes.func.isRequired,
  onSelectThumbMethod: PropTypes.func.isRequired,
  containerWidth: PropTypes.number.isRequired,
  width: PropTypes.number,
  scenes: PropTypes.array,
  thumbs: PropTypes.array,
};

export default VideoPlayer;
