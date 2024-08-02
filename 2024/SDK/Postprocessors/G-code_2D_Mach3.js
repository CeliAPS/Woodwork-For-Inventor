/*
  Copyright (C) 2021-2024 by Celi APS, Inc.
  All rights reserved.

  G-code Mach3 postprocessor.

  Date: 2022-01-19
*/

export var mandatorySettings = {
  description: 'G-code Mach3',
  legal: 'Copyright (C) 2021-2024 by Celi APS, Inc.',
  longDescription: 'Generic G-code post based on Mach3',
  certificationLevel: 2,
  minimumRevision: 4,
  fileExtension: 'nc',
  setCodePage: 'ascii',
  unit: 'mm',
  operationSort: 'ByOrder', // ByOrder, BySide, ByOperation
};

// local settings section
var lineNumber = false;
var toolLengthCorrection = false;
var useAdditionalComments = true;
var wordsSpacer = ' ';
var newLineChar = '\n';

// format section
var nrStr = Utility.CreateFormat({ prefix: 'N', decimals: 0 });
var gStr = Utility.CreateFormat({ prefix: 'G', decimals: 0, width: 2, zeropad: true });
var mStr = Utility.CreateFormat({ prefix: 'M', decimals: 0, width: 2, zeropad: true });
var xyzStr = Utility.CreateFormat({ decimals: (mandatorySettings.unit == 'mm' ? 3 : 4), scale: mandatorySettings.unit, forceDecimal: true });
var rStr = xyzStr; // radius
var feedStr = Utility.CreateFormat({ prefix: 'F', decimals: 0, scale: mandatorySettings.unit, forceDecimal: false });
var rpmStr = Utility.CreateFormat({ prefix: 'S', decimals: 0 });
var pStr = Utility.CreateFormat({ prefix: 'O', decimals: 0, width: 4, zeropad: true });
var tStr = Utility.CreateFormat({ prefix: 'T', decimals: 0, zeropad: true });
var hStr = Utility.CreateFormat({ prefix: 'H', decimals: 0, zeropad: true });

// variable section
var nrIncVar = Utility.CreateIncremental({ first: 10, step: 10 }, nrStr);
var gVar = Utility.CreateVariable({}, gStr);
var mVar = Utility.CreateVariable({}, mStr);
var feedVar = Utility.CreateVariable({}, feedStr);
var sVar = Utility.CreateVariable({ force: true }, rpmStr);
var pIncVar = Utility.CreateIncremental({ first: 1 }, pStr);
var xModal = Utility.CreateModal({ prefix: 'X' }, xyzStr);
var yModal = Utility.CreateModal({ prefix: 'Y' }, xyzStr);
var zModal = Utility.CreateModal({ prefix: 'Z' }, xyzStr);
var iRefVar = Utility.CreateModal({ prefix: 'I', force: true }, xyzStr);
var jRefVar = Utility.CreateModal({ prefix: 'J', force: true }, xyzStr);
var kRefVar = Utility.CreateModal({ prefix: 'K', force: true }, xyzStr);
var rRefVar = Utility.CreateModal({ prefix: 'R', force: true }, rStr);

// modal section
var gModal = Utility.CreateModal({}, gStr); // modal group 0 // G0 -G3
var gToolCorrectionModal = Utility.CreateModal({}, gStr); // modal group 3 // G40-G41-G42
var gAbsIncModal = Utility.CreateModal({}, gStr); // modal group 4 // G90-91
var gFeedModeModal = Utility.CreateModal({}, gStr); // modal group 5 // G93-94
var gUnitModal = Utility.CreateModal({}, gStr); // modal group 6 // G20-21

// local variables
var loadTool = true;
var stopTool = true;
var toolCorrection = '';
var localSafePlaneHeight = 0.0;
var localClearanceHeight = 0.0;

export function sideTransforms(sizes, corner, callFromNesting) {
  var transforms = new Array();
  var top;
  if (callFromNesting) {
    // rotated and shift coordinate system 
    top = Spacial.CreateCoordinateSystem(
      'Top',
      Spacial.CreatePoint(0.0, sizes.Width, 0.0),
      Spacial.CreateVector(0.0, -1.0, 0.0),
      Spacial.CreateVector(1.0, 0.0, 0.0),
      Spacial.CreateVector(0.0, 0.0, 1.0));
  }
  else {
    // No other side coordination systems required: G-code post is for 2D only !!!
    top = Spacial.CreateCoordinateSystem(
      'Top',
      Spacial.CreatePoint(0.0, 0.0, 0.0),
      Spacial.CreateVector(1.0, 0.0, 0.0),
      Spacial.CreateVector(0.0, 1.0, 0.0),
      Spacial.CreateVector(0.0, 0.0, 1.0));
  }
  transforms.push(top);
  return transforms;
}

// Main entry
export function onPostprocess() {
  var content = '';
  var fileName = '';
  // The top accessible object -> Job
  for (var index = 0; index < Job.Clampings.Count; index++) {
    content = '';
    content += formatStartSymbol();
    content += formatProgramNumber();
    content += formatMainInfo(Job, Job.Clampings[index]);
    content += onClamping(Job.Clampings[index]);
    content += formatEndSymbol();
    fileName = Job.Clampings[index].Part.Code + '_J1C' + (index + 1);
    var uniqueClampName = Job.Clampings[index].Name;
    if (uniqueClampName == '') {
      uniqueClampName = (Job.OutputOptions.CalledFromNesting ? 'Nest' : 'Clamp') + index;
    }
    Utility.WriteFile(fileName, mandatorySettings.fileExtension, content, uniqueClampName);
  }
}

function onClamping(clamp) {
  ReferenceCoordinateSystem.SetToClamping(clamp.Name);
  var output = formatJobStart();
  for (var index = 0; index < clamp.Operations.Count; index++) {
    checkToolLoadAndStop(clamp.Operations, index);
    output += onOperation(clamp.Operations[index]);
  }
  output += formatJobEnd();
  return output;
}

function checkToolLoadAndStop(operations, index) {
  if (index == 0) {
    loadTool = true;
  }
  else {
    var prevTool = operations[index - 1].Spindle.Code;
    var currentTool = operations[index].Spindle.Code;
    loadTool = prevTool == currentTool ? false : true;
  }
  if (index == operations.Count - 1) {
    stopTool = true;
  }
  else {
    var currentTool = operations[index].Spindle.Code;
    var nextTool = operations[index + 1].Spindle.Code;
    var currentRotDir = operations[index].Spindle.Tool.RotationDirection;
    var nextRotDir = operations[index + 1].Spindle.Tool.RotationDirection;
    stopTool = (currentTool == nextTool && currentRotDir == nextRotDir) ? false : true;
  }
}

function onOperation(operation) {
  var topSideNormalVector = Spacial.CreateVector(0.0, 0.0, 1.0);
  if (!topSideNormalVector.IsSameDirection(operation.Side.Zaxis)) {
    return writeLn(formatAdditionalComment(
      'Some operations found on the',
      operation.Side.Name,
      'side and were skipped because the postprocessor is 2D and works only on the Top side'));
  }

  var output = '';
  ReferenceCoordinateSystem.SetToSide(operation.Side.Zaxis);

  var point = Spacial.CreatePoint(0.0, 0.0, 0.0);
  var h = host.asType(Point, point).ToReferenceCoordinateSystem().Z
  localSafePlaneHeight = h + Job.Machine.SafePlaneHeight;
  localClearanceHeight = h + Job.Machine.ClearanceHeight;

  switch (operation.OperationType) {
    case OperationTypeEnum.DrillOperation:
      var drillOperation = host.asType(DrillOperation, operation);
      output += onDrillOperation(drillOperation);
      break;
    case OperationTypeEnum.MillOperation:
      var millOperation = host.asType(MillOperation, operation);
      output += onMillOperation(millOperation);
      break;
    case OperationTypeEnum.PocketOperation:
      var pockOperation = host.asType(PockOperation, operation);
      output += onPockOperation(pockOperation);
      break;
    case OperationTypeEnum.NestingOperation:
      var nestOperation = host.asType(NestOperation, operation);
      output += onNestOperation(nestOperation);
      break;
    case OperationTypeEnum.CalibrationOperation:
      var millCalibrationOperation = host.asType(MillCalibrationOperation, operation);
      output += onMillCalibrationOperation(millCalibrationOperation);
      break;
    case OperationTypeEnum.CutOperation:
    case OperationTypeEnum.GrooveOperation:
    case OperationTypeEnum.CutCalibrationOperation:
      output += writeLn(formatAdditionalComment("Saw blade operations are not yet implemented"));
      break;
    case OperationTypeEnum.MacroOperation:
      output += writeLn(formatAdditionalComment("Macro commands are not yet implemented"));
      break;
  }
  return output;
}

function onDrillOperation(operation) {
  var output = '';
  if (operation.IsThru)
    output += formatOperationInfo('THROUGH DRILLING', operation.Spindle);
  else
    output += formatOperationInfo('BLIND DRILLING', operation.Spindle);
  var toolNumber = parseFloat(operation.Spindle.Code);
  output += formatToolChange(toolNumber);
  output += formatSpindleRotation(operation);
  for (var index = 0; index < operation.Trajectories.Count; index++) {
    output += onDrillTrajectory(operation.Trajectories[index], operation.CuttingParameters);
  }
  output += formatStopSpindle();
  return output;
}

function onDrillTrajectory(trajectory, cuttingParameters) {
  var output = '';
  var point;
  for (var index = 0; index < trajectory.Geometry.Count; index++) {
    if (index == 0) {
      point = geometryPoint(trajectory.Geometry[0], '');
      output += writeLn(formatWords(gModal.Format(0),
        xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localSafePlaneHeight)));
    }

    point = geometryPoint(trajectory.Geometry[index], '');
    output += onDrillPoint(point, trajectory.BreakthroughDepth, cuttingParameters);

    if (index == trajectory.Geometry.Count - 1) {
      point = geometryPoint(trajectory.Geometry[trajectory.Geometry.Count - 1], '');
      output += writeLn(formatWords(gModal.Format(0),
        xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localSafePlaneHeight)));
    }
  }
  return output;
}

function onDrillPoint(point, breakthroughDepth, cuttingParameters) {
  var output = writeLn(formatWords(gModal.Format(0),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localClearanceHeight)));

  gModal.Reset();
  output += writeLn(formatWords(gModal.Format(1),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(point.Z - breakthroughDepth),
    feedVar.Format(cuttingParameters.CuttingFeedrate)));

  gModal.Reset();
  output += writeLn(formatWords(gModal.Format(0),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localClearanceHeight)));
  return output;
}

function onMillOperation(operation) {
  var output = formatOperationInfo('MILLING', operation.Spindle);
  var toolNumber = parseFloat(operation.Spindle.Code);
  var toolRadius = operation.Spindle.Tool.Diameter / 2.0;
  output += formatToolChange(toolNumber);
  output += formatSpindleRotation(operation);
  for (var index = 0; index < operation.Trajectories.Count; index++) {
    output += onMillTrajectory(operation.Trajectories[index], operation.CuttingParameters, toolRadius);
  }
  output += formatStopSpindle();
  return output;
}

function onMillTrajectory(trajectory, cuttingParameters, toolRadius) {
  var depths = stepoverDepths(trajectory.FullDepth, trajectory.Stepover);
  resetModal();
  var output = writeLn(formatAdditionalComment('To milling contour'));
  output += onToolCorrection(trajectory.MillContour, cuttingParameters, toolRadius);
  output += onMillContour(trajectory.MillContour, depths, cuttingParameters);
  output += onToolCorrectionOff();
  return output;
}

function onMillContour(millContour, depths, cuttingParameters) {
  var output = '';
  output += formatOrbitalLanding(millContour.OrbitalLanding, cuttingParameters);
  depths.forEach(depth => {
    output += onLeadIn(millContour.LeadIn, depth, cuttingParameters);
    output += onContour(millContour.MainContour, depth, cuttingParameters);
    output += onLeadOut(millContour.LeadOut, depth, cuttingParameters);
  });
  return output;
}

function onToolCorrection(millContour, cuttingParameters, toolRadius) {
  var output = '';
  var point = geometryPoint(millContour.LeadIn.Geometry[0], 'Start');
  if (millContour.OffsetType == TrajectoryOffsetTypeEnum.Software) {
    output += writeLn(formatWords(gModal.Format(0),
      xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localSafePlaneHeight)));
    return output;
  }

  switch (millContour.OffsetSide) {
    case OffsetSideEnum.Left:
      toolCorrection = 'Left';
      break;
    case OffsetSideEnum.Right:
      toolCorrection = 'Right';
      break;
    case OffsetSideEnum.Center:
      toolCorrection = 'Center';
      break;
  }

  var preStartPoint = startPointForToolCorrection(millContour, toolRadius);
  output += writeLn(formatWords(gModal.Format(0),
    xModal.Format(preStartPoint.X), yModal.Format(preStartPoint.Y), zModal.Format(localSafePlaneHeight)));
  output += writeLn(formatWords(gModal.Format(0),
    xModal.Format(preStartPoint.X), yModal.Format(preStartPoint.Y), zModal.Format(localClearanceHeight)));

  if (millContour.LeadIn.LeadType != LeadTypeEnum.Tangent) {
    // if leadIn is not Tangent type, make tool correction before lead
    if (millContour.OffsetSide == OffsetSideEnum.Left) {
      output += writeLn(formatWords(gModal.Format(1), gVar.Format(41),
        xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localClearanceHeight),
        feedVar.Format(cuttingParameters.LeadInFeedrate)));
      toolCorrection = 'Done';
    } else if (millContour.OffsetSide == OffsetSideEnum.Right) {
      output += writeLn(formatWords(gModal.Format(1), gVar.Format(42),
        xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localClearanceHeight),
        feedVar.Format(cuttingParameters.LeadInFeedrate)));
      toolCorrection = 'Done';
    }
  }
  return output;
}

function onToolCorrectionOff() {
  var output = '';
  if (toolCorrection == 'Done') {
    output += writeLn(formatWords(gStr.Output(40)));
    toolCorrection = '';
  }
  output += writeLn(formatWords(gModal.Format(0), zModal.Format(localSafePlaneHeight)));
  return output;
}

function stepoverDepths(depth, stepover) {
  var depths = [];
  if (stepover == 0.0) {
    depths.push(0.0);
    return depths;
  }

  var index = 1;
  var stepDepth = stepover * index;
  while (stepDepth < depth) {
    var d = stepDepth - depth;
    if (Math.abs(d) < 0.0001)
      d = 0.0;
    depths.push(d);
    index++;;
    stepDepth = stepover * index;
  }

  if (!depths.includes(0.0)) {
    depths.push(0.0);
  }
  return depths;
}

function formatOrbitalLanding(orbitalLanding, cuttingParameters) {
  if (!orbitalLanding.Exists) {
    return '';
  }

  resetModal();
  var output = writeLn(formatAdditionalComment('Orbital landing'));
  var startPt = geometryPoint(orbitalLanding.Geometry[0], 'Start');
  var centerPt = geometryPoint(orbitalLanding.Geometry[1], 'Start');
  output += writeLn(formatWords(gModal.Format(0),
    xModal.Format(startPt.X), yModal.Format(startPt.Y), zModal.Format(localClearanceHeight)));

  output += writeLn(formatWords(gStr.Output(91))); // incremental distance mode
  var oneArcDepth = orbitalLanding.Pitch / 2.0;
  var vec = Spacial.CreateVector(startPt, centerPt);
  vec.Z = 0.0;
  vec.Normalize();
  vec.ScaleBy(orbitalLanding.Radius * 2.0);

  var sidePt;
  var landingDepth = oneArcDepth;
  var diffX = 0.0;
  var diffY = 0.0;
  // deepening 
  do {
    sidePt = Spacial.CreatePoint(startPt.X, startPt.Y, startPt.Z);
    sidePt.TranslateBy(vec);
    diffX = sidePt.X - startPt.X;
    diffY = sidePt.Y - startPt.Y;
    output += orbitalLandingArc(diffX, diffY, -oneArcDepth, orbitalLanding.Radius, orbitalLanding.Counterclockwise, cuttingParameters.OrbitalLandingFeedrate);
    startPt = Spacial.CreatePoint(sidePt.X, sidePt.Y, sidePt.Z);
    vec.ScaleBy(-1.0);
    landingDepth += oneArcDepth;
  } while (landingDepth <= orbitalLanding.FullDepth);

  // go exactly to bottom 
  landingDepth -= oneArcDepth;
  if (landingDepth <= orbitalLanding.FullDepth) {
    var leakedDepth = Math.abs(orbitalLanding.FullDepth - landingDepth);
    sidePt = Spacial.CreatePoint(startPt.X, startPt.Y, startPt.Z);
    sidePt.TranslateBy(vec);
    diffX = sidePt.X - startPt.X;
    diffY = sidePt.Y - startPt.Y;
    output += orbitalLandingArc(diffX, diffY, -leakedDepth, orbitalLanding.Radius, orbitalLanding.Counterclockwise, cuttingParameters.OrbitalLandingFeedrate);
    startPt = Spacial.CreatePoint(sidePt.X, sidePt.Y, sidePt.Z);
    vec.ScaleBy(-1.0);
  }
  // arc to remove left material
  sidePt = Spacial.CreatePoint(startPt.X, startPt.Y, startPt.Z);
  sidePt.TranslateBy(vec);
  diffX = sidePt.X - startPt.X;
  diffY = sidePt.Y - startPt.Y;
  output += orbitalLandingArc(diffX, diffY, 0.0, orbitalLanding.Radius, orbitalLanding.Counterclockwise, cuttingParameters.OrbitalLandingFeedrate);
  startPt = Spacial.CreatePoint(sidePt.X, sidePt.Y, sidePt.Z);

  // arc to center
  diffX = centerPt.X - startPt.X;
  diffY = centerPt.Y - startPt.Y;
  output += orbitalLandingArc(diffX, diffY, 0.0, orbitalLanding.Radius / 2.0, orbitalLanding.Counterclockwise, cuttingParameters.OrbitalLandingFeedrate);
  output += writeLn(formatWords(gStr.Output(90))); // back to absolute distance Mode
  resetModal();
  output += writeLn(formatWords(gModal.Format(0),
    xModal.Format(centerPt.X), yModal.Format(centerPt.Y), zModal.Format(localClearanceHeight)));
  return output;
}

function orbitalLandingArc(x, y, z, r, counterclockwise, feedrate) {
  gModal.Reset();
  xModal.Reset();
  yModal.Reset();
  zModal.Reset();
  rRefVar.Reset();
  return writeLn(formatWords(
    gModal.Format(counterclockwise ? 3 : 2),
    xModal.Format(x), yModal.Format(y), zModal.Format(z), rRefVar.Format(r),
    feedVar.Format(feedrate)));
}

function onLeadIn(leadIn, depth, cuttingParameters) {
  var output = writeLn(formatAdditionalComment(resolveLeadType(leadIn), 'leadIn'));
  switch (leadIn.LeadType) {
    case LeadTypeEnum.Direct:
      output += formatLeadInDirect(leadIn.Geometry, depth, cuttingParameters);
      break;
    case LeadTypeEnum.Tangent:
      output += formatLeadInTangent(leadIn.Geometry, depth, cuttingParameters);
      break;
    case LeadTypeEnum.Ramp:
      output += formatLeadInRamp(leadIn.Geometry, depth, cuttingParameters);
      break;
    case LeadTypeEnum.Arc:
      output += formatLeadInArc(leadIn.Geometry, depth, cuttingParameters);
      break;
  }
  return output;
}

function onLeadOut(leadOut, depth, cuttingParameters) {
  var output = writeLn(formatAdditionalComment(resolveLeadType(leadOut), 'leadOut'));
  switch (leadOut.LeadType) {
    case LeadTypeEnum.Direct:
      output += formatLeadOutDirect(leadOut.Geometry, depth, cuttingParameters);
      break;
    case LeadTypeEnum.Tangent:
      output += formatLeadOutTangent(leadOut.Geometry, depth, cuttingParameters);
      break;
    case LeadTypeEnum.Ramp:
      output += formatLeadOutRamp(leadOut.Geometry, depth, cuttingParameters);
      break;
    case LeadTypeEnum.Arc:
      output += formatLeadOutArc(leadOut.Geometry, depth, cuttingParameters);
      break;
  }
  return output;
}

function resolveLeadType(obj) {
  var output = '';
  switch (obj.LeadType) {
    case LeadTypeEnum.Direct:
      output = 'Direct';
      break;
    case LeadTypeEnum.Tangent:
      output = 'Tangent';
      break;
    case LeadTypeEnum.Arc:
      output = 'Arc';
      break;
    case LeadTypeEnum.Ramp:
      output = 'Ramp';
      break;
    case LeadTypeEnum.Perpendicular:
      output = 'Perpendicular';
      break;
    default:
      output = 'Unknown';
      break;
  }
  return output;
}

function onContour(countour, depth, cuttingParameters) {
  var output = writeLn(formatAdditionalComment('Contour'));
  var geometry = countour.Geometry;
  for (var index = 0; index < geometry.Count; index++) {
    output += onWorkPoint(geometry[index], 'End', depth, cuttingParameters.CuttingFeedrate);
  }
  return output;
}

function onWorkPoint(geometry, pos, depth, feedrate) {
  var point;
  var output = '';
  switch (geometry.GeometryType) {
    case GeometryTypeEnum.Point:
      point = getPoint(geometry, '');
      output = writeLn(formatWords(gModal.Format(1),
        xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(point.Z - depth),
        feedVar.Format(feedrate)));
      break;
    case GeometryTypeEnum.Segment:
      var line = host.asType(Segment, geometry);
      point = getPoint(line, pos);
      var correction = '';
      if (toolCorrection == 'Left') {
        toolCorrection = 'Done';
        correction = formatWords(gVar.Format(41));
      } else if (toolCorrection == 'Right') {
        toolCorrection = 'Done';
        correction = formatWords(gVar.Format(42));
      }
      output = writeLn(formatWords(gModal.Format(1), correction,
        xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(point.Z - depth),
        feedVar.Format(feedrate)));
      break;
    case GeometryTypeEnum.Arc:
      var arc = host.asType(Arc, geometry);
      var s = getPoint(arc, 'Start');
      var c = getPoint(arc, 'Center');
      var i = c.X - s.X;
      var j = c.Y - s.Y;
      point = getPoint(arc, pos);
      var gArc = arc.Counterclockwise ? 3 : 2;
      output = writeLn(formatWords(gModal.Format(gArc),
        xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(point.Z - depth),
        iRefVar.Format(i), jRefVar.Format(j), feedVar.Format(feedrate)));
      break;
  }
  return output;
}

function onPockOperation(operation) {
  var output = formatOperationInfo('POCKETING', operation.Spindle);
  var toolNumber = parseFloat(operation.Spindle.Code);
  var toolRadius = operation.Spindle.Tool.Diameter / 2.0;
  output += formatToolChange(toolNumber);
  output += formatSpindleRotation(operation);
  for (var index = 0; index < operation.Trajectories.Count; index++) {
    output += onPockTrajectory(operation.Trajectories[index], operation.CuttingParameters, toolRadius);
  }
  output += formatStopSpindle();
  return output;
}

function onPockTrajectory(trajectory, cuttingParameters, toolRadius) {
  var depths = stepoverDepths(trajectory.FullDepth, trajectory.Stepover);
  var output = '';
  if (trajectory.MiddleRemovalContours.Count > 0) {
    resetModal();
    output += writeLn(formatAdditionalComment('To pocket middle removal'));
    output += onToolCorrection(trajectory.MiddleRemovalContours[0], cuttingParameters, toolRadius);
    for (var index = 0; index < trajectory.MiddleRemovalContours.Count; index++) {
      output += onPockContour(trajectory.MiddleRemovalContours[index], depths, cuttingParameters);
    }
    output += onToolCorrectionOff();
  }

  if (trajectory.FinishContours.Count > 0) {
    if (!trajectory.FinishContourStepover)
      var depths = stepoverDepths(trajectory.FullDepth, 0.0);
    resetModal();
    output += writeLn(formatAdditionalComment('To pocketing finish contour'));
    output += onToolCorrection(trajectory.FinishContours[0], cuttingParameters, toolRadius);
    for (var index = 0; index < trajectory.FinishContours.Count; index++) {
      output += onPockContour(trajectory.FinishContours[index], depths, cuttingParameters);
    }
    output += onToolCorrectionOff();
  }
  return output;
}

function onPockContour(pocketContour, depths, cuttingParameters) {
  var output = '';
  output += formatOrbitalLanding(pocketContour.OrbitalLanding, cuttingParameters);
  depths.forEach(depth => {
    output += onLeadIn(pocketContour.LeadIn, depth, cuttingParameters);
    output += onContour(pocketContour.MainContour, depth, cuttingParameters);
    output += onLeadOut(pocketContour.LeadOut, depth, cuttingParameters);
  });
  return output;
}

function onMillCalibrationOperation(operation) {
  var output = formatOperationInfo('CALIBRATION MILLING', operation.Spindle);
  var toolNumber = parseFloat(operation.Spindle.Code);
  var toolRadius = operation.Spindle.Tool.Diameter / 2.0;
  output += formatToolChange(toolNumber);
  output += formatSpindleRotation(operation);
  for (var index = 0; index < operation.Trajectories.Count; index++) {
    output += onMillTrajectory(operation.Trajectories[index], operation.CuttingParameters, toolRadius);
  }
  output += formatStopSpindle();
  return output;
}

function onNestOperation(operation) {
  var output = formatOperationInfo('NEST MILLING', operation.Spindle);
  var toolNumber = parseFloat(operation.Spindle.Code);
  var toolRadius = operation.Spindle.Tool.Diameter / 2.0;
  output += formatToolChange(toolNumber);
  output += formatSpindleRotation(operation);
  for (var index = 0; index < operation.Trajectories.Count; index++) {
    output += onNestTrajectory(operation.Trajectories[index], operation.CuttingParameters, toolRadius);
  }
  output += formatStopSpindle();
  return output;
}

function onNestTrajectory(trajectory, cuttingParameters, toolRadius) {
  var depths = stepoverDepths(trajectory.FullDepth, trajectory.Stepover);
  resetModal();
  var output = writeLn(formatAdditionalComment('To nest milling contour'));
  output += onToolCorrection(trajectory.NestContour, cuttingParameters, toolRadius);
  output += onNestContour(trajectory.NestContour, depths, cuttingParameters, trajectory.BridgeHeight);
  output += onToolCorrectionOff();
  return output;
}

function onNestContour(nestContour, depths, cuttingParameters, bridgeHeight) {
  var output = '';
  depths.forEach(depth => {
    output += onLeadIn(nestContour.LeadIn, depth, cuttingParameters);
    output += onNestMainContour(nestContour.MainContour, depth, cuttingParameters, bridgeHeight);
    output += onLeadOut(nestContour.LeadOut, depth, cuttingParameters);
  });
  return output;
}

function onNestMainContour(countour, depth, cuttingParameters, bridgeHeight) {
  var output = writeLn(formatAdditionalComment('Contour'));
  var geometry = contour.Geometry;
  var point = geometryPoint(geometry[0], 'Start');
  point = host.asType(Point, point).ToReferenceCoordinateSystem();
  var diff = Math.abs(point.Z - depth) - bridgeHeight;
  if (diff < 0)
    geometry = removeBridges(geometry);
  for (var index = 0; index < geometry.Count; index++) {
    output += onWorkPoint(geometry[index], 'End', depth, cuttingParameters.CuttingFeedrate);
  }
  return output;
}

function removeBridges(geometry) {
  var newGeom = [];
  var count = 0;
  var startH = geometryPoint(geometry[0], 'Start').Z;
  for (var index = 0; index < geometry.Count; index++) {
    var startZ = geometryPoint(geometry[index], 'Start').Z;
    var endZ = geometryPoint(geometry[index], 'End').Z;
    if (startZ == startH && endZ == startH) {
      newGeom.push(geometry[index])
      count++;
    }
  }
  newGeom.Count = count;
  return newGeom;
}

// general section
function startPointForToolCorrection(countour, toolRadius) {
  var geometry = countour.LeadIn.Geometry[0];
  if (geometry.GeometryType == GeometryTypeEnum.Arc) {
    return geometryPoint(geometry, 'Center');
  }
  var firstElementDirection = geometryDirection(countour.MainContour.Geometry[0]);
  firstElementDirection.ScaleBy(toolRadius * 1.1);
  var preStartPoint = geometryPoint(geometry, 'Start');
  preStartPoint.TranslateBy(firstElementDirection);
  return preStartPoint;
}

function geometryDirection(geometry) {
  var vec;
  switch (geometry.GeometryType) {
    case GeometryTypeEnum.Point:
      vec = Spacial.CreateVector(0.0, 0.0, 0.0);
      break;
    case GeometryTypeEnum.Segment:
      var line = host.asType(Segment, geometry);
      vec = line.Direction.ToReferenceCoordinateSystem();
      break;
    case GeometryTypeEnum.Arc:
      var arc = host.asType(Arc, geometry);
      vec = arc.Direction.ToReferenceCoordinateSystem();
      break;
  }
  return vec;
}

function geometryPoint(geometry, pos) {
  var point;
  switch (geometry.GeometryType) {
    case GeometryTypeEnum.Point:
      point = getPoint(geometry, '');
      break;
    case GeometryTypeEnum.Segment:
      var line = host.asType(Segment, geometry);
      point = getPoint(line, pos);
      break;
    case GeometryTypeEnum.Arc:
      var arc = host.asType(Arc, geometry);
      point = getPoint(arc, pos);
      break;
  }
  return point;
}

function getPoint(geometry, pos) {
  var point;
  switch (pos.toUpperCase()) {
    case 'START':
      point = geometry.StartPoint;
      break;
    case 'END':
      point = geometry.EndPoint;
      break;
    case 'CENTER':
      point = geometry.CenterPoint;
      break;
    default:
      point = geometry;
      break;
  }
  return host.asType(Point, point).ToReferenceCoordinateSystem();
}

function resetModal() {
  gVar.Reset();
  gModal.Reset();
  gModal.Reset();
  xModal.Reset();
  yModal.Reset();
  zModal.Reset();
}
// general section end

// format section
function formatLeadInDirect(geometry, depth, cuttingParameters) {
  var point = geometryPoint(geometry[0], 'Start');
  var output = writeLn(formatWords(gModal.Format(0),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localClearanceHeight)));
  output += writeLn(formatWords(gModal.Format(1),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(point.Z - depth),
    feedVar.Format(cuttingParameters.DirectLandingFeedrate)));
  return output;
}

function formatLeadOutDirect(geometry, cuttingParameters) {
  var point = geometryPoint(geometry[geometry.Count - 1], 'End');
  var output = writeLn(formatWords(gModal.Format(0),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localClearanceHeight)));
  return output;
}

function formatLeadInTangent(geometry, depth, cuttingParameters) {
  var point = geometryPoint(geometry[0], 'Start');
  var output = writeLn(formatWords(gModal.Format(0),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localClearanceHeight)));
  output += writeLn(formatWords(gModal.Format(1),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(point.Z - depth),
    feedVar.Format(cuttingParameters.DirectLandingFeedrate)));
  for (var index = 0; index < geometry.Count; index++) {
    output += onWorkPoint(geometry[index], 'End', depth, cuttingParameters.LeadInFeedrate);
  }
  return output;
}

function formatLeadOutTangent(geometry, depth, cuttingParameters) {
  var output = '';
  for (var index = 0; index < geometry.Count; index++) {
    output += onWorkPoint(geometry[index], 'End', depth, cuttingParameters.LeadInFeedrate);
  }
  var point = geometryPoint(geometry[geometry.Count - 1], 'End');
  output += writeLn(formatWords(gModal.Format(0),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localClearanceHeight)));
  return output;
}

function formatLeadInRamp(geometry, depth, cuttingParameters) {
  var point = geometryPoint(geometry[0], 'Start');
  var output = writeLn(formatWords(gModal.Format(0),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localClearanceHeight)));
  for (var index = 0; index < geometry.Count; index++) {
    output += onWorkPoint(geometry[index], 'End', depth, cuttingParameters.LeadInFeedrate);
  }
  return output;
}

function formatLeadOutRamp(geometry, depth, cuttingParameters) {
  var output = '';
  for (var index = 0; index < geometry.Count; index++) {
    output += onWorkPoint(geometry[index], 'End', depth, cuttingParameters.LeadInFeedrate);
  }
  var point = geometryPoint(geometry[geometry.Count - 1], 'End');
  output += writeLn(formatWords(gModal.Format(0),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localClearanceHeight)));
  return output;
}

function formatLeadInArc(geometry, depth, cuttingParameters) {
  var point = geometryPoint(geometry[0], 'Start');
  var output = writeLn(formatWords(gModal.Format(0),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localClearanceHeight)));
  output += writeLn(formatWords(
    gModal.Format(1),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(point.Z - depth),
    feedVar.Format(cuttingParameters.LeadInFeedrate)));
  for (var index = 0; index < geometry.Count; index++) {
    output += onWorkPoint(geometry[index], 'End', depth, cuttingParameters.LeadInFeedrate);
  }
  return output;
}

function formatLeadOutArc(geometry, depth, cuttingParameters) {
  var output = '';
  for (var index = 0; index < geometry.Count; index++) {
    output += onWorkPoint(geometry[index], 'End', depth, cuttingParameters.LeadInFeedrate);
  }
  var point = geometryPoint(geometry[geometry.Count - 1], 'End');
  output += writeLn(formatWords(gModal.Format(0),
    xModal.Format(point.X), yModal.Format(point.Y), zModal.Format(localClearanceHeight)));
  return output;
}

function formatToolChange(toolNumber) {
  var output = '';
  resetModal();
  mVar.Reset();
  feedVar.Reset();

  toolCorrection = '';

  if (!loadTool)
    return output;
  output += writeLn(formatWords(tStr.Output(toolNumber), mStr.Output(6)));
  if (toolLengthCorrection) {
    output += writeLn(formatWords(gStr.Output(43), hStr.Output(toolNumber)));
  }
  return output;
}

function formatSpindleRotation(operation) {
  var output = '';
  if (!loadTool)
    return output;
  return writeLn(formatWords(mStr.Output((operation.Spindle.Tool.RotationDirection == ToolRotationDirectionEnum.Clockwise ? 3 : 4)),
    sVar.Format(operation.CuttingParameters.Speed)));
}

function formatStopSpindle() {
  var output = '';
  if (!stopTool)
    return output;
  if (toolLengthCorrection) {
    var output = writeLn(formatWords(gStr.Output(49), hStr.Output(0)));
  }
  output += writeLn(mVar.Format(5));
  return output;
}

function formatOperationInfo(name, spindle) {
  var output = writeLn(formatComment(
    name + ':',
    spindle.Name + '; diameter=',
    xyzStr.Output(spindle.Tool.Diameter)));
  return output;
}

function formatJobStart() {
  var output = writeLn(gAbsIncModal.Format(90));
  output += writeLn(gUnitModal.Format(mandatorySettings.unit == 'mm' ? 21 : 20));
  output += writeLn(formatWords(gVar.Format(92), xModal.Format(0), yModal.Format(0), zModal.Format(0)));
  return output;
}

function formatJobEnd() {
  var output = writeLn(mVar.Format(5));
  output += writeLn(mVar.Format(30));
  return output;
}

function formatMainInfo(job, clamp) {
  var part = clamp.Part
  var output = writeLn(formatComment('File is generated by Woodwork for Inventor CAM'));
  output += writeLn(formatComment('Postprocessor file: ' + Utility.PostprocessorLocation()));
  output += writeLn(formatComment('Postprocessor hash: ' + Utility.FileChecksum()));
  output += writeLn(formatComment('Part:',
    part.Name == '' ? '' : 'name= ' + part.Name,
    part.Code == '' ? '' : 'code= ' + part.Code));
  output += writeLn(formatComment('Units:', mandatorySettings.unit));
  output += writeLn(formatComment('Size:',
    'length=', xyzStr.Output(part.Length),
    'width=', xyzStr.Output(part.Width),
    'thickness=', xyzStr.Output(part.Thickness)));
  output += writeLn(formatComment('Safe plane height=', xyzStr.Output(job.Machine.SafePlaneHeight)));
  output += writeLn(formatComment('Clearance height=', xyzStr.Output(job.Machine.ClearanceHeight)));
  output += writeLn(formatComment('Output generated from', job.CallEnvironment));
  return output;
}

function formatStartSymbol() {
  return '%' + newLineChar;
}

function formatProgramNumber() {
  return pIncVar.Format() + newLineChar;
}

function formatEndSymbol() {
  return '%' + newLineChar;
}

function formatComment() {
  return '(' + wordsSpacer + formatWords(arguments) + wordsSpacer + ')';
}

function formatAdditionalComment() {
  if (useAdditionalComments)
    return '(' + wordsSpacer + formatWords(arguments) + wordsSpacer + ')';
  return '';
}

function formatWords() {
  var output = '';
  // array case
  if (arguments.constructor === Object && arguments[0].constructor === Object) {
    var words = arguments[0];
    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      if (word.length != 0) {
        output += word + wordsSpacer;
      }
    }
  }
  else { // string case    
    for (var i = 0; i < arguments.length; i++) {
      var word = arguments[i];
      if (word.length != 0) {
        output += word + wordsSpacer;
      }
    }
  }
  if (output.length > 0 && wordsSpacer.length > 0) {
    output = output.slice(0, -1);
  }
  if (output == gStr.Output(0) || output == gStr.Output(1) || output == gStr.Output(2) || output == gStr.Output(3)) {
    return '';
  }
  return output;
}

function writeLn(line) {
  if (line.length == 0)
    return '';
  var nr = lineNumber ? nrIncVar.Format() + wordsSpacer : '';
  return nr + line + newLineChar;
}
// format section end