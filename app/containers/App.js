import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
// import keydown from 'react-keydown';
import { Sticky, Menu, Icon, Loader } from 'semantic-ui-react';
import Dropzone from 'react-dropzone';

import '../app.global.css';
import FileList from '../containers/FileList';
import SettingsList from '../containers/SettingsList';
import SortedVisibleThumbGrid from '../containers/VisibleThumbGrid';
import ErrorBoundary from '../components/ErrorBoundary';
import VideoPlayer from '../components/VideoPlayer';
import ThumbEmpty from '../components/ThumbEmpty';
import { getLowestFrame, getHighestFrame, getVisibleThumbs, saveMoviePrint, getColumnCount, getThumbsCount, getMoviePrintColor } from '../utils/utils';
import styles from './App.css';
import {
  setNewMovieList, toggleLeftSidebar, showRightSidebar, hideRightSidebar,
  zoomIn, zoomOut, addDefaultThumbs, setDefaultThumbCount, setDefaultColumnCount,
  setVisibilityFilter, setCurrentFileId, updateFileColumnCount,
  updateFileDetails, clearThumbs, updateThumbImage, setDefaultMarginRatio, setDefaultShowHeader,
  setDefaultRoundedCorners, setDefaultThumbInfo, setDefaultOutputPath, setDefaultOutputFormat,
  setDefaultSaveOptionOverwrite, setDefaultThumbnailScale,
  showPlaybar, hidePlaybar
} from '../actions';

const { ipcRenderer } = require('electron');
const { dialog } = require('electron').remote;

const setColumnAndThumbCount = (that, columnCount, thumbCount) => {
  that.setState({
    columnCountTemp: columnCount,
    thumbCountTemp: thumbCount,
    columnCount,
    thumbCount,
  });
};

const getScaleValueObject = (
  file, settings, columnCount = 3, thumbCount = 3,
  containerWidth, containerHeight, zoomOutBool
) => {
  const movieWidth = (file !== undefined && file.width !== undefined ? file.width : 1280);
  const movieHeight = (file !== undefined && file.height !== undefined ? file.height : 720);
  const aspectRatioInv = (movieHeight * 1.0) / movieWidth;
  const rowCount = Math.ceil(thumbCount / columnCount);
  const headerHeight = settings.defaultShowHeader ? movieHeight *
    settings.defaultHeaderHeightRatio * settings.defaultThumbnailScale : 0;
  const thumbWidth = movieWidth * settings.defaultThumbnailScale;
  const thumbMargin = movieWidth * settings.defaultMarginRatio * settings.defaultThumbnailScale;
  const borderRadius = settings.defaultRoundedCorners ? movieWidth *
    settings.defaultBorderRadiusRatio * settings.defaultThumbnailScale : 0;
  const generalScale = 0.95;

  const thumbnailWidthPlusMargin = thumbWidth + (thumbMargin * 2);
  const thumbnailHeightPlusMargin = thumbnailWidthPlusMargin * aspectRatioInv;

  const moviePrintWidth = columnCount * thumbnailWidthPlusMargin;
  const moviePrintHeightBody = rowCount * thumbnailHeightPlusMargin;
  const moviePrintHeight = headerHeight + (thumbMargin * 2) + moviePrintHeightBody;

  const videoHeight = ((containerHeight * 2) / 3) - settings.defaultVideoPlayerControllerHeight;
  const videoWidth = videoHeight / aspectRatioInv;
  let videoPlayerHeight = videoHeight + settings.defaultVideoPlayerControllerHeight;
  let videoPlayerWidth = videoWidth;
  if (videoWidth > containerWidth) {
    videoPlayerWidth = containerWidth - (settings.defaultBorderMargin * 2);
    videoPlayerHeight = (videoPlayerWidth * aspectRatioInv) +
      settings.defaultVideoPlayerControllerHeight;
  }
  const thumbnailHeightForThumbView =
    ((videoPlayerHeight / 2) - (settings.defaultBorderMargin * 3));
  const thumbnailWidthForThumbView = thumbnailHeightForThumbView / aspectRatioInv;
  const thumbMarginForThumbView = thumbnailWidthForThumbView * settings.defaultMarginRatio;
  const thumbnailWidthPlusMarginForThumbView =
    thumbnailWidthForThumbView + (thumbMarginForThumbView * 2);
  const moviePrintWidthForThumbView =
    thumbCount * thumbnailWidthPlusMarginForThumbView; // only one row

  const scaleValueWidth = containerWidth / moviePrintWidth;
  const scaleValueHeight = containerHeight / moviePrintHeight;
  const scaleValue = Math.min(scaleValueWidth, scaleValueHeight) * generalScale;
  // console.log(scaleValue);
  const newMoviePrintWidth =
    zoomOutBool ? moviePrintWidth * scaleValue : moviePrintWidthForThumbView;
  const newMoviePrintHeightBody =
    zoomOutBool ? moviePrintHeightBody * scaleValue : moviePrintHeightBody;
  const newMoviePrintHeight = zoomOutBool ? moviePrintHeight * scaleValue : moviePrintHeight;
  const newThumbMargin = zoomOutBool ? thumbMargin * scaleValue : thumbMarginForThumbView;
  const newThumbWidth = zoomOutBool ? thumbWidth * scaleValue : thumbnailWidthForThumbView;
  const newBorderRadius = zoomOutBool ? borderRadius * scaleValue : borderRadius;
  const newHeaderHeight = zoomOutBool ? headerHeight * scaleValue : headerHeight;
  const newScaleValue = zoomOutBool ? settings.defaultThumbnailScale * scaleValue :
    settings.defaultThumbnailScale;

  const scaleValueObject = {
    containerWidth,
    containerHeight,
    aspectRatioInv,
    movieWidth,
    movieHeight,
    newMoviePrintWidth,
    newMoviePrintHeight,
    newMoviePrintHeightBody,
    newThumbMargin,
    newThumbWidth,
    newBorderRadius,
    newHeaderHeight,
    newScaleValue,
    videoPlayerHeight,
    videoPlayerWidth,
  };
  return scaleValueObject;
};

class App extends Component {
  constructor() {
    super();
    this.state = {
      containerHeight: 0,
      containerWidth: 0,
      columnCountTemp: undefined,
      thumbCountTemp: undefined,
      columnCount: undefined,
      thumbCount: undefined,
      reCapture: false,
      colorArray: undefined,
      scaleValueObject: undefined,
      savingMoviePrint: false,
      selectedThumbObject: undefined,
      outputScaleCompensator: 1,
      accept: 'video/*',
      dropzoneActive: false,
    };

    this.handleKeyPress = this.handleKeyPress.bind(this);

    this.onSelectMethod = this.onSelectMethod.bind(this);

    this.hideLeftSidebar = this.hideLeftSidebar.bind(this);
    this.toggleLeftSidebar = this.toggleLeftSidebar.bind(this);
    this.editGrid = this.editGrid.bind(this);
    this.hideEditGrid = this.hideEditGrid.bind(this);
    this.onShowThumbs = this.onShowThumbs.bind(this);
    this.onViewToggle = this.onViewToggle.bind(this);
    this.onTogglePlaybar = this.onTogglePlaybar.bind(this);
    this.switchToPrintView = this.switchToPrintView.bind(this);
    this.onSaveMoviePrint = this.onSaveMoviePrint.bind(this);
    this.onGetFadeInOut = this.onGetFadeInOut.bind(this);

    this.updatecontainerWidthAndHeight = this.updatecontainerWidthAndHeight.bind(this);
    this.updateScaleValue = this.updateScaleValue.bind(this);

    this.onChangeRow = this.onChangeRow.bind(this);
    this.onChangeColumn = this.onChangeColumn.bind(this);
    this.onChangeColumnAndApply = this.onChangeColumnAndApply.bind(this);
    this.onReCaptureClick = this.onReCaptureClick.bind(this);
    this.onApplyClick = this.onApplyClick.bind(this);
    this.onCancelClick = this.onCancelClick.bind(this);

    this.onChangeMargin = this.onChangeMargin.bind(this);
    this.onShowHeaderClick = this.onShowHeaderClick.bind(this);
    this.onRoundedCornersClick = this.onRoundedCornersClick.bind(this);
    this.onShowHiddenThumbsClick = this.onShowHiddenThumbsClick.bind(this);
    this.onThumbInfoClick = this.onThumbInfoClick.bind(this);
    this.onChangeOutputPathClick = this.onChangeOutputPathClick.bind(this);
    this.onOutputFormatClick = this.onOutputFormatClick.bind(this);
    this.onOverwriteClick = this.onOverwriteClick.bind(this);
    this.onThumbnailScaleClick = this.onThumbnailScaleClick.bind(this);
  }

  componentWillMount() {
    const { store } = this.context;
    setColumnAndThumbCount(
      this,
      getColumnCount(
        this.props.file,
        store.getState().undoGroup.present.settings
      ),
      getThumbsCount(
        this.props.file,
        this.props.thumbsByFileId,
        store.getState().undoGroup.present.settings,
        store.getState().visibilitySettings.visibilityFilter
      ),
    );
    this.setState({
      colorArray: getMoviePrintColor(store.getState()
        .undoGroup.present.settings.defaultThumbCountMax),
      scaleValueObject: getScaleValueObject(
        this.props.file, this.props.settings,
        // this.state.columnCount, this.state.thumbCount,
        this.state.columnCountTemp, this.state.thumbCountTemp,
        this.state.containerWidth, this.state.containerHeight,
        this.props.visibilitySettings.zoomOut
      )
    });
  }

  componentDidMount() {
    const { store } = this.context;

    ipcRenderer.on('receive-get-file-details', (event, fileId, filePath, posterFrameId, lastItem, frameCount, width, height, fps, fourCC) => {
      store.dispatch(updateFileDetails(fileId, frameCount, width, height, fps, fourCC));
      ipcRenderer.send('send-get-poster-frame', fileId, filePath, posterFrameId);
      if (lastItem) {
        console.log('I am the lastItem');
        store.dispatch(setCurrentFileId(store.getState().undoGroup.present.files[0].id));
        this.updateScaleValue(); // so the aspect ratio of the thumbs are correct after drag
        store.dispatch(clearThumbs());
        store.dispatch(addDefaultThumbs(
          store.getState().undoGroup.present.files[0],
          store.getState().undoGroup.present.settings.defaultThumbCount
        ));
      }
    });

    ipcRenderer.on('receive-get-thumbs', (event, fileId, thumbId, frameId, base64, frameNumber) => {
      store.dispatch(updateThumbImage(fileId, thumbId, frameId, base64, frameNumber));
    });

    // poster frames don't have thumbId
    ipcRenderer.on('receive-get-poster-frame', (event, fileId, posterFrameId, base64, frameNumber) => {
      store.dispatch(updateThumbImage(fileId, '', posterFrameId, base64, frameNumber, 1));
    });

    ipcRenderer.on('received-saved-file', (event, path) => {
      setTimeout(
        this.setState({ savingMoviePrint: false }),
        1000
      ); // adding timeout to prevent clicking multiple times
      console.log(`Saved file: ${path}`);
    });

    ipcRenderer.on('received-saved-file-error', (event, message) => {
      setTimeout(
        this.setState({ savingMoviePrint: false }),
        1000
      ); // adding timeout to prevent clicking multiple times
      console.log(`Saved file error: ${message}`);
    });

    document.addEventListener('keydown', this.handleKeyPress);

    this.updatecontainerWidthAndHeight();
    window.addEventListener('resize', this.updatecontainerWidthAndHeight);
  }

  componentWillReceiveProps(nextProps) {
    const { store } = this.context;
    const state = store.getState();

    if (this.props.file !== undefined &&
      nextProps.file !== undefined &&
      this.props.file.id !== undefined) {
      // check if currentFileId changed
      if (this.props.file.id !== nextProps.file.id) {
        const newThumbCount = getThumbsCount(
          nextProps.file,
          nextProps.thumbsByFileId,
          state.undoGroup.present.settings,
          nextProps.visibilitySettings.visibilityFilter
        );
        setColumnAndThumbCount(
          this,
          nextProps.file.columnCount,
          newThumbCount
        );
        console.log('currentFileId changed');
        console.log(nextProps.file.columnCount);
        console.log(newThumbCount);
      }
      const oldThumbCount = getThumbsCount(
        this.props.file,
        this.props.thumbsByFileId,
        state.undoGroup.present.settings,
        this.props.visibilitySettings.visibilityFilter
      );
      const newThumbCount = getThumbsCount(
        nextProps.file,
        nextProps.thumbsByFileId,
        state.undoGroup.present.settings,
        nextProps.visibilitySettings.visibilityFilter
      );
      if (oldThumbCount !== newThumbCount) {
        // check if visibleThumbCount changed
        setColumnAndThumbCount(
          this,
          nextProps.file.columnCount,
          newThumbCount
        );
        console.log('visibleThumbCount changed');
        console.log(newThumbCount);
      }
    }
  }

  componentDidUpdate(prevProps, prevState) {
    console.log('App.js componentDidUpdate');
    this.updatecontainerWidthAndHeight();

    // update scaleValue when these parameter change
    if (((prevProps.file === undefined || this.props.file === undefined) ? false : (prevProps.file.width !== this.props.file.width)) ||
      ((prevProps.file === undefined || this.props.file === undefined) ? false : (prevProps.file.height !== this.props.file.height)) ||
      prevProps.settings.defaultThumbnailScale !== this.props.settings.defaultThumbnailScale ||
      prevProps.settings.defaultMarginRatio !== this.props.settings.defaultMarginRatio ||
      prevProps.settings.defaultShowHeader !== this.props.settings.defaultShowHeader ||
      prevProps.settings.defaultRoundedCorners !== this.props.settings.defaultRoundedCorners ||
      prevState.outputScaleCompensator !== this.state.outputScaleCompensator ||
      prevProps.visibilitySettings.zoomOut !== this.props.visibilitySettings.zoomOut ||
      prevState.columnCountTemp !== this.state.columnCountTemp ||
      prevState.thumbCountTemp !== this.state.thumbCountTemp ||
      prevState.columnCount !== this.state.columnCount ||
      prevState.thumbCount !== this.state.thumbCount
    ) {
      this.updateScaleValue();
    }
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyPress);

    window.removeEventListener('resize', this.updatecontainerWidthAndHeight);
  }

  handleKeyPress(event) {
    // you may also add a filter here to skip keys, that do not have an effect for your app
    // this.props.keyPressAction(event.keyCode);

    const { store } = this.context;

    if (event) {
      switch (event.which) {
        case 49: // press 1
          this.toggleLeftSidebar();
          break;
        case 51: // press 3
          if (store.getState().visibilitySettings.showRightSidebar) {
            this.onCancelClick();
          } else {
            this.editGrid();
          }
          break;
        case 80: // press 'p'
          this.onSaveMoviePrint();
          break;
        default:
      }
      console.log(`ctrl:${event.ctrlKey}, shift:${event.shiftKey}, meta:${event.metaKey}, keynum:${event.which}`);
    }
  }

  onDragEnter() {
    this.setState({
      dropzoneActive: true
    });
  }

  onDragLeave() {
    this.setState({
      dropzoneActive: false
    });
  }

  onDrop(files) {
    this.setState({
      files,
      dropzoneActive: false
    });
    const { store } = this.context;
    const { settings } = store.getState().undoGroup.present;
    console.log('Files dropped: ', files);
    if (Array.from(files).some(file => file.type.match('video.*'))) {
      store.dispatch(setNewMovieList(files, settings));
    }
    return false;
  }

  applyMimeTypes(event) {
    this.setState({
      accept: event.target.value
    });
  }

  updateScaleValue() {
    // console.log(`inside updateScaleValue and containerWidth: ${this.state.containerWidth}`);
    const scaleValueObject = getScaleValueObject(
      this.props.file, this.props.settings,
      this.state.columnCountTemp, this.state.thumbCountTemp,
      this.state.containerWidth, this.state.containerHeight,
      this.props.visibilitySettings.zoomOut
    );
    this.setState(
      {
        scaleValueObject
      },
      () => {
        if (this.state.outputScaleCompensator !== scaleValueObject.newScaleValue) {
          console.log('got newscalevalue');
          this.setState({
            outputScaleCompensator: scaleValueObject.newScaleValue
          });
        }
      }
    );
  }

  updatecontainerWidthAndHeight() {
    // wrapped in try catch as in a global error case this.siteContent ref is not set
    try {
      const containerWidthInner =
        this.siteContent.clientWidth -
        (this.props.visibilitySettings.showLeftSidebar ? 350 : 0) -
        (this.props.visibilitySettings.showRightSidebar ? 350 : 0) -
        (this.props.file ? 0 : 700); // for startup
      const containerHeightInner = this.siteContent.clientHeight -
        (this.props.file ? 0 : 100); // for startup
      if ((Math.abs(this.state.containerHeight - containerHeightInner) > 5) ||
      (Math.abs(this.state.containerWidth - containerWidthInner) > 5)) {
        console.log(`new containerWidth: ${containerHeightInner}`);
        console.log(`new containerHeight: ${containerWidthInner}`);
        this.setState({
          containerHeight: containerHeightInner,
          containerWidth: containerWidthInner
        }, () => this.updateScaleValue());
      }
      return true;
    } catch (e) {
      return undefined;
    }
  }

  onSelectMethod(file, thumbId, frameNumber) {
    this.setState({
      selectedThumbObject: {
        thumbId,
        frameNumber
      }
    });
  }

  hideLeftSidebar() {
    const { store } = this.context;
    if (this.props.visibilitySettings.showLeftSidebar) {
      store.dispatch(toggleLeftSidebar());
    }
  }

  toggleLeftSidebar() {
    const { store } = this.context;
    store.dispatch(toggleLeftSidebar());
  }

  editGrid() {
    const { store } = this.context;
    store.dispatch(showRightSidebar());
    console.log(this.state.columnCount);
    console.log(this.state.thumbCount);
    setColumnAndThumbCount(
      this,
      getColumnCount(
        this.props.file,
        store.getState().undoGroup.present.settings
      ),
      getThumbsCount(
        this.props.file,
        this.props.thumbsByFileId,
        store.getState().undoGroup.present.settings,
        store.getState().visibilitySettings.visibilityFilter
      ),
    );
    this.switchToPrintView();
  }

  hideEditGrid() {
    const { store } = this.context;
    store.dispatch(hideRightSidebar());
  }

  onShowThumbs() {
    const { store } = this.context;
    if (this.props.visibilitySettings.visibilityFilter === 'SHOW_VISIBLE') {
      store.dispatch(setVisibilityFilter('SHOW_ALL'));
    } else {
      store.dispatch(setVisibilityFilter('SHOW_VISIBLE'));
    }
  }

  switchToPrintView() {
    const { store } = this.context;
    store.dispatch(zoomOut());
  }

  onViewToggle() {
    const { store } = this.context;
    if (this.props.visibilitySettings.zoomOut) {
      this.hideEditGrid();
      this.hideLeftSidebar();
      store.dispatch(zoomIn());
    } else {
      store.dispatch(zoomOut());
    }
  }

  onTogglePlaybar() {
    const { store } = this.context;
    if (this.props.visibilitySettings.showPlaybar) {
      store.dispatch(hidePlaybar());
    } else {
      store.dispatch(showPlaybar());
    }
  }

  onSaveMoviePrint() {
    this.setState(
      { savingMoviePrint: true },
      saveMoviePrint(
        'ThumbGrid',
        this.props.settings.defaultOutputPath,
        this.props.file,
        this.props.settings.defaultThumbnailScale / this.state.outputScaleCompensator,
        this.props.settings.defaultOutputFormat,
        this.props.settings.defaultSaveOptionOverwrite
      )
    );
  }

  onGetFadeInOut() {
    console.log('inside onGetFadeInOut');
    console.log(this.props.file);
    ipcRenderer.send('send-get-fadeInOut', this.props.file.id, this.props.file.path);
  }

  onChangeRow = (value) => {
    this.setState({ thumbCountTemp: this.state.columnCountTemp * value });
    this.updateScaleValue();
  };

  onChangeColumn = (value) => {
    const { store } = this.context;
    const tempRowCount = Math.ceil(this.state.thumbCountTemp / this.state.columnCountTemp);
    this.setState({ columnCountTemp: value });
    if (this.state.reCapture) {
      this.setState({ thumbCountTemp: tempRowCount * value });
    }
    if (this.props.file !== undefined) {
      store.dispatch(updateFileColumnCount(
        this.props.file.id,
        value
      ));
    }
    this.updateScaleValue();
  };

  onChangeColumnAndApply = (value) => {
    const { store } = this.context;
    this.setState({
      columnCountTemp: value,
      columnCount: value
    });
    if (this.props.file !== undefined) {
      store.dispatch(updateFileColumnCount(
        this.props.file.id,
        value
      ));
    }
    this.updateScaleValue();
  };

  onReCaptureClick = (checked) => {
    console.log(`${this.state.columnCount} : ${this.state.columnCountTemp} || ${this.state.thumbCount} : ${this.state.thumbCountTemp}`);
    if (!checked) {
      this.setState({ thumbCountTemp: this.state.thumbCount });
    } else {
      const newThumbCount = this.state.columnCountTemp *
        Math.ceil(this.state.thumbCountTemp / this.state.columnCountTemp);
      this.setState({ thumbCountTemp: newThumbCount });
    }
    this.setState({ reCapture: checked });
  };

  onApplyClick = () => {
    const { store } = this.context;
    console.log(`${this.state.columnCount} : ${this.state.columnCountTemp} || ${this.state.thumbCount} : ${this.state.thumbCountTemp}`);
    this.setState({ columnCount: this.state.columnCountTemp });
    if (this.state.reCapture) {
      this.setState({ thumbCount: this.state.thumbCountTemp });
      this.onThumbCountChange(this.state.columnCountTemp, this.state.thumbCountTemp);
    }
    if (this.props.file !== undefined) {
      store.dispatch(updateFileColumnCount(
        this.props.file.id,
        this.state.columnCountTemp
      ));
    }
    this.hideEditGrid();
  };

  onCancelClick = () => {
    console.log(this.state.columnCount);
    console.log(this.state.thumbCount);
    this.setState({ columnCountTemp: this.state.columnCount });
    this.setState({ thumbCountTemp: this.state.thumbCount });
    this.hideEditGrid();
  };

  onThumbCountChange = (columnCount, thumbCount) => {
    const { store } = this.context;
    store.dispatch(setDefaultColumnCount(columnCount));
    store.dispatch(setDefaultThumbCount(thumbCount));
    if (this.props.currentFileId !== undefined) {
      store.dispatch(addDefaultThumbs(
        this.props.file,
        thumbCount,
        getLowestFrame(getVisibleThumbs(
          (this.props.thumbsByFileId[this.props.currentFileId] === undefined)
            ? undefined : this.props.thumbsByFileId[this.props.currentFileId].thumbs,
          this.props.visibilitySettings.visibilityFilter
        )),
        getHighestFrame(getVisibleThumbs(
          (this.props.thumbsByFileId[this.props.currentFileId] === undefined)
            ? undefined : this.props.thumbsByFileId[this.props.currentFileId].thumbs,
          this.props.visibilitySettings.visibilityFilter
        ))
      ));
    }
  };

  onChangeMargin = (value) => {
    const { store } = this.context;
    store.dispatch(setDefaultMarginRatio(value /
        store.getState().undoGroup.present.settings.defaultMarginSliderFactor));
  };

  onShowHeaderClick = (value) => {
    const { store } = this.context;
    store.dispatch(setDefaultShowHeader(value));
  };

  onRoundedCornersClick = (value) => {
    const { store } = this.context;
    store.dispatch(setDefaultRoundedCorners(value));
  };

  onShowHiddenThumbsClick = (value) => {
    const { store } = this.context;
    if (value) {
      store.dispatch(setVisibilityFilter('SHOW_ALL'));
    } else {
      store.dispatch(setVisibilityFilter('SHOW_VISIBLE'));
    }
  };

  onThumbInfoClick = (value) => {
    const { store } = this.context;
    store.dispatch(setDefaultThumbInfo(value));
  };

  onChangeOutputPathClick = () => {
    const { store } = this.context;
    const newPathArray = dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    const newPath = (newPathArray !== undefined ? newPathArray[0] : undefined);
    if (newPath) {
      console.log(newPath);
      store.dispatch(setDefaultOutputPath(newPath));
    }
  };

  onOutputFormatClick = (value) => {
    const { store } = this.context;
    console.log(value);
    store.dispatch(setDefaultOutputFormat(value));
  };

  onOverwriteClick = (value) => {
    const { store } = this.context;
    store.dispatch(setDefaultSaveOptionOverwrite(value));
  };

  onThumbnailScaleClick = (value) => {
    const { store } = this.context;
    store.dispatch(setDefaultThumbnailScale(value));
  };

  render() {
    const { accept, dropzoneActive } = this.state;

    return (
      <ErrorBoundary>
        <Dropzone
          disableClick
          disablePreview
          style={{ position: 'relative' }}
          accept={accept}
          onDrop={this.onDrop.bind(this)}
          onDragEnter={this.onDragEnter.bind(this)}
          onDragLeave={this.onDragLeave.bind(this)}
          className={styles.dropzoneshow}
          acceptClassName={styles.dropzoneshowAccept}
          rejectClassName={styles.dropzoneshowReject}
        >
          {({ isDragAccept, isDragReject }) => {
            return (
              <div>
                <button
                  onClick={this.onGetFadeInOut}
                >
                  get fade in out
                </button>
                <div className={`${styles.Site}`}>
                  <div
                    className={`${styles.SiteContent}`}
                    ref={(el) => { this.siteContent = el; }}
                  >
                    <div
                      className={`${styles.ItemSideBar} ${styles.ItemLeftSideBar} ${this.props.visibilitySettings.showLeftSidebar ? styles.ItemLeftSideBarAnim : ''}`}
                    >
                      <FileList />
                    </div>
                    <div
                      className={`${styles.ItemSideBar} ${styles.ItemRightSideBar} ${this.props.visibilitySettings.showRightSidebar ? styles.ItemRightSideBarAnim : ''}`}
                    >
                      <SettingsList
                        settings={this.props.settings}
                        visibilitySettings={this.props.visibilitySettings}
                        file={this.props.file}
                        columnCountTemp={this.state.columnCountTemp}
                        thumbCountTemp={this.state.thumbCountTemp}
                        rowCountTemp={Math.ceil(this.state.thumbCountTemp /
                          this.state.columnCountTemp)}
                        columnCount={this.state.columnCount}
                        rowCount={Math.ceil(this.state.thumbCount / this.state.columnCount)}
                        reCapture={this.state.reCapture}
                        onChangeColumn={this.onChangeColumn}
                        onChangeColumnAndApply={this.onChangeColumnAndApply}
                        onChangeRow={this.onChangeRow}
                        onReCaptureClick={this.onReCaptureClick}
                        onApplyClick={this.onApplyClick}
                        onCancelClick={this.onCancelClick}
                        onChangeMargin={this.onChangeMargin}
                        onShowHeaderClick={this.onShowHeaderClick}
                        onRoundedCornersClick={this.onRoundedCornersClick}
                        onShowHiddenThumbsClick={this.onShowHiddenThumbsClick}
                        onThumbInfoClick={this.onThumbInfoClick}
                        onChangeOutputPathClick={this.onChangeOutputPathClick}
                        onOutputFormatClick={this.onOutputFormatClick}
                        onOverwriteClick={this.onOverwriteClick}
                        onThumbnailScaleClick={this.onThumbnailScaleClick}
                      />
                    </div>
                    {!this.props.visibilitySettings.zoomOut &&
                      <div
                        className={`${styles.ItemVideoPlayer} ${this.props.visibilitySettings.showLeftSidebar ? styles.ItemMainLeftAnim : ''}`}
                        style={{
                          top: `${this.props.settings.defaultBorderMargin}px`
                        }}
                      >
                        { this.props.file ? (
                          <VideoPlayer
                            ref={(el) => { this.videoPlayer = el; }}
                            path={this.props.file ? (this.props.file.path || '') : ''}
                            aspectRatioInv={this.state.scaleValueObject.aspectRatioInv}
                            height={this.state.scaleValueObject.videoPlayerHeight}
                            width={this.state.scaleValueObject.videoPlayerWidth}
                            controllerHeight={this.props.settings.defaultVideoPlayerControllerHeight}
                            thumbId={this.state.selectedThumbObject ? this.state.selectedThumbObject.thumbId : undefined}
                            showPlaybar={this.props.visibilitySettings.showPlaybar}
                            frameNumber={this.state.selectedThumbObject ? this.state.selectedThumbObject.frameNumber : 0}
                            positionRatio={this.state.selectedThumbObject ? ((this.state.selectedThumbObject.frameNumber * 1.0) / (this.props.file.frameCount || 1)) : 0}
                          />
                        ) :
                        (
                          <div
                            style={{
                              opacity: '0.3',
                            }}
                          >
                            <ThumbEmpty
                              color={(this.state.colorArray !== undefined ? this.state.colorArray[0] : undefined)}
                              thumbImageObjectUrl={undefined}
                              aspectRatioInv={this.state.scaleValueObject.aspectRatioInv}
                              thumbWidth={this.state.scaleValueObject.videoPlayerWidth}
                              borderRadius={this.state.scaleValueObject.newBorderRadius}
                              margin={this.state.scaleValueObject.newThumbMargin}
                            />
                          </div>
                        )
                        }
                      </div>
                    }
                    <div
                      ref={(r) => { this.divOfSortedVisibleThumbGridRef = r; }}
                      className={`${styles.ItemMain} ${this.props.visibilitySettings.showLeftSidebar ? styles.ItemMainLeftAnim : ''} ${this.props.visibilitySettings.zoomOut ? styles.ItemMainMinHeight : ''} ${this.props.visibilitySettings.showRightSidebar ? styles.ItemMainRightAnim : ''} ${this.props.visibilitySettings.showRightSidebar ? styles.ItemMainEdit : ''} ${!this.props.visibilitySettings.zoomOut ? styles.ItemMainTopAnim : ''}`}
                      style={{
                        width: this.props.visibilitySettings.zoomOut ? undefined : this.state.scaleValueObject.newMoviePrintWidth,
                        marginTop: this.props.visibilitySettings.zoomOut ? undefined :
                          `${this.state.scaleValueObject.videoPlayerHeight +
                            (this.props.settings.defaultBorderMargin * 2)}px`
                      }}
                    >
                      { this.props.file ? (
                        <SortedVisibleThumbGrid
                          inputRef={(r) => { this.sortedVisibleThumbGridRef = r; }}
                          // inputRefThumb={this.scrollIntoViewElement} // for the thumb scrollIntoView function
                          editGrid={this.props.visibilitySettings.showRightSidebar}

                          containerHeight={this.state.containerHeight}
                          containerWidth={this.state.containerWidth}
                          selectedThumbId={this.state.selectedThumbObject ? this.state.selectedThumbObject.thumbId : undefined}
                          selectMethod={this.onSelectMethod}
                          onThumbDoubleClick={this.onViewToggle}
                          onThumbDoubleClick={this.onViewToggle}
                                parentMethod={this.openModal}

                          colorArray={this.state.colorArray}
                          columnCount={this.props.visibilitySettings.showRightSidebar ?
                            this.state.columnCountTemp :
                            (this.props.file ? this.props.file.columnCount || this.state.columnCountTemp :
                              this.state.columnCountTemp)}
                          thumbCount={this.state.thumbCountTemp}
                          reCapture={this.state.reCapture}

                          zoomOut={this.props.visibilitySettings.zoomOut}
                          scaleValueObject={this.state.scaleValueObject}
                        />
                      ) :
                      (
                        <div
                          className={styles.ItemMainStartupContainer}
                          style={{
                            // flex: '1 auto',
                          }}
                        >
                          <div
                            className={`${styles.ItemMainStartupItem} ${this.props.visibilitySettings.zoomOut ? '' : styles.hiddenItem}`}
                          >
                            DROP MOVIES
                          </div>
                          <div
                            className={styles.ItemMainStartupItem}
                            style={{
                              flexGrow: 3,
                              position: 'relative',
                            }}
                          >
                            <div
                              style={{
                                opacity: '0.3',
                              }}
                            >
                              <SortedVisibleThumbGrid
                                inputRef={(r) => { this.sortedVisibleThumbGridRef = r; }}
                                // inputRefThumb={this.scrollIntoViewElement} // for the thumb scrollIntoView function
                                editGrid={this.props.visibilitySettings.showRightSidebar}

                                containerHeight={this.state.containerHeight}
                                containerWidth={this.state.containerWidth}
                                selectedThumbId={this.state.selectedThumbObject ? this.state.selectedThumbObject.thumbId : undefined}
                                selectMethod={this.onSelectMethod}
                                onThumbDoubleClick={this.onViewToggle}
                                parentMethod={this.openModal}

                                colorArray={this.state.colorArray}
                                columnCount={this.props.visibilitySettings.showRightSidebar ?
                                  this.state.columnCountTemp :
                                  (this.props.file ? this.props.file.columnCount || this.state.columnCountTemp :
                                    this.state.columnCountTemp)}
                                thumbCount={this.state.thumbCountTemp}
                                reCapture={this.state.reCapture}

                                zoomOut={this.props.visibilitySettings.zoomOut}
                                scaleValueObject={this.state.scaleValueObject}
                              />
                            </div>
                            <div
                              className={`${this.props.visibilitySettings.zoomOut ? '' : styles.hiddenItem}`}
                              style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                              }}
                            >
                              CUSTOMISE LOOK
                            </div>
                          </div>
                          <div
                            className={`${styles.ItemMainStartupItem} ${this.props.visibilitySettings.zoomOut ? '' : styles.hiddenItem}`}
                          >
                            SAVE MOVIEPRINT
                          </div>
                        </div>
                      )
                      }
                    </div>
                  </div>
                </div>
                <Sticky
                  className={`${styles.FixedActionMenuRight} ${styles.ItemRightSideBar} ${this.props.visibilitySettings.showRightSidebar ? styles.ItemRightSideBarAnim : ''}`}
                >
                  <Menu
                    compact
                    icon="labeled"
                    size="mini"
                  >
                    {this.props.visibilitySettings.zoomOut &&
                      <Menu.Item
                        name="save"
                        onClick={this.onSaveMoviePrint}
                        color="orange"
                        active={!this.state.savingMoviePrint}
                        className={styles.FixedActionMenuFlex}
                        disabled={this.state.savingMoviePrint}
                      >
                        { this.state.savingMoviePrint ?
                          <Loader
                            active
                            inline
                            size="small"
                          />
                          :
                          <Icon
                            name="save"
                          />
                        }
                        Save MoviePrint
                      </Menu.Item>
                    }
                    {!this.props.visibilitySettings.showRightSidebar &&
                      <Menu.Item
                        name="zoom"
                        onClick={this.onViewToggle}
                        className={styles.FixedActionMenuFlex}
                      >
                        <Icon
                          name={(this.props.visibilitySettings.zoomOut) ? 'picture' : 'block layout'}
                        />
                        {(this.props.visibilitySettings.zoomOut) ? 'Thumb view' : 'Print view'}
                      </Menu.Item>
                    }
                    {this.props.visibilitySettings.zoomOut &&
                      <Menu.Item
                        name="edit"
                        onClick={(this.props.visibilitySettings.showRightSidebar === false) ? this.editGrid : this.hideEditGrid}
                        className={styles.FixedActionMenuFlex}
                      >
                        <Icon
                          name={(this.props.visibilitySettings.showRightSidebar === false) ? 'edit' : 'edit'}
                        />
                        {(this.props.visibilitySettings.showRightSidebar === false) ? 'Customise look' : 'Hide'}
                      </Menu.Item>
                    }
                    {!this.props.visibilitySettings.zoomOut &&
                      <Menu.Item
                        name="playbar"
                        onClick={this.onTogglePlaybar}
                        className={styles.FixedActionMenuFlex}
                      >
                        <Icon
                          name={(this.props.visibilitySettings.showPlaybar === false) ? 'video' : 'video'}
                        />
                        {(this.props.visibilitySettings.showPlaybar === false) ? 'Show playbar' : 'Hide playbar'}
                      </Menu.Item>
                    }
                  </Menu>
                </Sticky>
                <Sticky
                  className={`${styles.FixedActionMenuLeft} ${styles.ItemLeftSideBar} ${this.props.visibilitySettings.showLeftSidebar ? styles.ItemLeftSideBarAnim : ''}`}
                >
                  <Menu
                    compact
                    icon="labeled"
                    size="mini"
                  >

                    {true &&
                      <Menu.Item
                        name="list"
                        onClick={this.toggleLeftSidebar}
                        className={styles.FixedActionMenuFlex}
                      >
                        <Icon
                          name="list"
                        />
                        {(this.props.visibilitySettings.showLeftSidebar === false) ? 'Movies' : 'Hide'}
                      </Menu.Item>
                    }

                  </Menu>
                </Sticky>
                { dropzoneActive &&
                  <div
                    className={`${styles.dropzoneshow} ${isDragAccept ? styles.dropzoneshowAccept : ''} ${isDragReject ? styles.dropzoneshowReject : ''}`}
                  >
                    <div
                      className={styles.dropzoneshowContent}
                    >
                      {`${isDragAccept ? 'DROP' : ''} ${isDragReject ? 'NOT ALLOWED' : ''}`}
                    </div>
                  </div>
                }
              </div>
            );
          }}
        </Dropzone>
      </ErrorBoundary>
    );
  }
}

const mapStateToProps = state => {
  const tempCurrentFileId = state.undoGroup.present.settings.currentFileId;
  return {
    currentFileId: tempCurrentFileId,
    files: state.undoGroup.present.files,
    file: state.undoGroup.present.files
      .find((file) => file.id === tempCurrentFileId),
    settings: state.undoGroup.present.settings,
    visibilitySettings: state.visibilitySettings,
    defaultThumbCount: state.undoGroup.present.settings.defaultThumbCount,
    defaultColumnCount: state.undoGroup.present.settings.defaultColumnCount,
    thumbsByFileId: state.undoGroup.present.thumbsByFileId,
  };
};

App.contextTypes = {
  store: PropTypes.object
};

export default connect(mapStateToProps)(App);
