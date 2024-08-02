/*
  Copyright (C) 2021-2024 by Celi APS, Inc.
  All rights reserved.

  Format-4 for tpaCAD 4.x JavaScript postprocessor
  
  Date: 2022-04-13
*/

export var mandatorySettings = {
    description: 'Format-4 for tpaCAD 4.x',
    legal: 'Copyright (C) 2021-2024 by Celi APS, Inc.',
    longDescription: 'Generic Format-4 for tpaCAD 4.x rev_06 05-07-2018',
    certificationLevel: 3,
    minimumRevision: 5,
    fileExtension: 'tcn',
    setCodePage: 'ascii',
    unit: 'mm',
    operationSort: 'BySide', // ByOrder, BySide, ByOperation
};

var feedFormat = Utility.CreateFormat({ decimals: 0, trim: true, forceDecimal: false, scale: mandatorySettings.unit });
var rpmFormat = Utility.CreateFormat({ decimals: 0, trim: true, forceDecimal: false, scale: 1.0 });
var doubleFormat = Utility.CreateFormat({ decimals: (mandatorySettings.unit == "mm" ? 5 : 6), trim: true, forceDecimal: false, scale: mandatorySettings.unit });
var intFormat = Utility.CreateFormat({ decimals: 0, trim: true, forceDecimal: false, scale: 1 });
var angleFormat = Utility.CreateFormat({ decimals: 5, trim: true, forceDecimal: false, scale: 'deg' });

export function sideTransforms(sizes, corner, callFromNesting) {
    var transforms = new Array();
    transforms.push(Spacial.CreateCoordinateSystem(
        'Top',
        Spacial.CreatePoint(0.0, 0.0, 0.0),
        Spacial.CreateVector(1.0, 0.0, 0.0),
        Spacial.CreateVector(0.0, 1.0, 0.0),
        Spacial.CreateVector(0.0, 0.0, 1.0)));
    transforms.push(Spacial.CreateCoordinateSystem(
        'Front',
        Spacial.CreatePoint(0.0, 0.0, -sizes.Thickness),
        Spacial.CreateVector(1.0, 0.0, 0.0),
        Spacial.CreateVector(0.0, 0.0, 1.0),
        Spacial.CreateVector(0.0, -1.0, 0.0)));
    transforms.push(Spacial.CreateCoordinateSystem(
        'Back',
        Spacial.CreatePoint(0.0, sizes.Width, -sizes.Thickness),
        Spacial.CreateVector(1.0, 0.0, 0.0),
        Spacial.CreateVector(0.0, 0.0, 1.0),
        Spacial.CreateVector(0.0, 1.0, 0.0)));
    transforms.push(Spacial.CreateCoordinateSystem(
        'Left',
        Spacial.CreatePoint(0.0, 0.0, -sizes.Thickness),
        Spacial.CreateVector(0.0, 1.0, 0.0),
        Spacial.CreateVector(0.0, 0.0, 1.0),
        Spacial.CreateVector(-1.0, 0.0, 0.0)));
    transforms.push(Spacial.CreateCoordinateSystem(
        'Right',
        Spacial.CreatePoint(sizes.Length, 0.0, -sizes.Thickness),
        Spacial.CreateVector(0.0, 1.0, 0.0),
        Spacial.CreateVector(0.0, 0.0, 1.0),
        Spacial.CreateVector(1.0, 0.0, 0.0)));
    transforms.push(Spacial.CreateCoordinateSystem(
        'Bottom',
        Spacial.CreatePoint(0.0, 0.0, -sizes.Thickness),
        Spacial.CreateVector(1.0, 0.0, 0.0),
        Spacial.CreateVector(0.0, 1.0, 0.0),
        Spacial.CreateVector(0.0, 0.0, 1.0)));
    transforms.push(Spacial.CreateCoordinateSystem(
        'Custom',
        Spacial.CreatePoint(0.0, 0.0, 0.0),
        Spacial.CreateVector(1.0, 0.0, 0.0),
        Spacial.CreateVector(0.0, 1.0, 0.0),
        Spacial.CreateVector(0.0, 0.0, -1.0)));
    return transforms;
}

// local variables section
var newLineChar = '\n';
var currentSideNumber = -1;

// Main entry
export function onPostprocess() {
    var content = '';
    var fileName = '';

    for (var index = 0; index < Job.Clampings.Count; index++) {
        content += onClamping(Job.Clampings[index]);
        fileName = Job.Clampings[index].Part.Code + '_J1C' + (index + 1);
        var uniqueClampName = Job.Clampings[index].Name;
        if (uniqueClampName == '') {
            uniqueClampName = (Job.OutputOptions.CalledFromNesting ? 'Nest' : 'Clamp') + index;
        }
        Utility.WriteFile(fileName, mandatorySettings.fileExtension, content, uniqueClampName);
    }
}

function onClamping(clamping) {
    ReferenceCoordinateSystem.SetToClamping(clamping.Name);

    var repamedSides = remapNameAndNumbers(clamping.Sides);
    var output = formatHeader(clamping, repamedSides);
    output += formatExecutionSection();
    output += formatVariablesSection();
    output += formatOptimizationSection();
    output += formatFictitiousFacesSection(repamedSides);

    for (var index = 0; index < repamedSides.length; index++) {
        var side = repamedSides[index];
        if (side.OperationsCount == 0)
            continue;
        output += formatSideBlockStart(side);
        for (var o = 0; o < clamping.Operations.Count; o++) {
            var operation = clamping.Operations[o];
            currentSideNumber = operation.Side.RemappedNumber;
            if (side == clamping.Operations[o].Side)
                output += onOperation(operation);
        }
        output += formatSideBlockEnd();
    }
    return output;
}
function onOperation(operation) {
    var output = '';
    if (operation.Side.InclinedPlane)
        ReferenceCoordinateSystem.SetNewCoordinateSystem(
            Spacial.CreateCoordinateSystem('Inclined', operation.Side.Origin, operation.Side.Xaxis, operation.Side.Yaxis, operation.Side.Zaxis));
    else
        ReferenceCoordinateSystem.SetToSide(operation.Side.Name);

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
        case OperationTypeEnum.CutOperation:
            var cutOperation = host.asType(CutOperation, operation);
            output += onCutOperation(cutOperation);
            break;
        case OperationTypeEnum.GrooveOperation:
            var grooveOperation = host.asType(GrooveOperation, operation);
            output += onGrooveOperation(grooveOperation);
            break;
        case OperationTypeEnum.NestingOperation:
            var nestOperation = host.asType(NestOperation, operation);
            output += onNestOperation(nestOperation);
            break;
        case OperationTypeEnum.CalibrationOperation:
            var millCalibrationOperation = host.asType(MillCalibrationOperation, operation);
            output += onMillCalibrationOperation(millCalibrationOperation);
            break;
        case OperationTypeEnum.CutCalibrationOperation:
            var cutCalibrationOperation = host.asType(CutCalibrationOperation, operation);
            output += onCutCalibrationOperation(cutCalibrationOperation);
            break;
        case OperationTypeEnum.MacroOperation:
            var macroOperation = host.asType(MacroOperation, operation);
            output += onMacroOperation(macroOperation);
            break;
    }
    return output;
}
function onDrillOperation(operation) {
    var output = '';
    for (var i = 0; i < operation.Trajectories.Count; i++) {
        const trajectory = operation.Trajectories[i];
        for (var j = 0; j < trajectory.Geometry.Count; j++) {
            var drillPoint = pointPoint(trajectory.Geometry[j]);
            var drillOutput = formatOperationBlockStart(81, 'p');
            drillOutput += formatToolDefinition(operation, false);
            drillOutput += formatPoint(drillPoint, -trajectory.FullDepth)
            drillOutput += formatCuttingParameters(operation.CuttingParameters);
            drillOutput += formatToolType(operation.IsThru ? 1 : 0);
            drillOutput += formatOperationBlockEnd();
            output += writeLn(drillOutput);
        }
    }
    return output;
}
function onMillOperation(operation) {
    var output = '';
    for (var i = 0; i < operation.Trajectories.Count; i++) {
        const trajectory = operation.Trajectories[i];
        output += onCountour(operation, trajectory, trajectory.MillContour);
    }
    return output;
}
function onPockOperation(operation) {
    var output = '';
    for (var i = 0; i < operation.Trajectories.Count; i++) {
        var trajectory = operation.Trajectories[i];

        for (var j = 0; j < trajectory.MiddleRemovalContours.Count; j++) {
            const pockContour = trajectory.MiddleRemovalContours[j];
            output += onCountour(operation, trajectory, pockContour);
        }

        for (var k = 0; k < trajectory.FinishContours.Count; k++) {
            const pockContour = trajectory.FinishContours[k];
            output += onCountour(operation, trajectory, pockContour);
        }
    }
    return output;
}
function onCutOperation(operation) {
    var output = '';
    for (var i = 0; i < operation.Trajectories.Count; i++) {
        const trajectory = operation.Trajectories[i];
        const cutPath = trajectory.CutPaths;
        output += onCutPath(operation, trajectory, cutPath.MainPath);
    }
    return output;
}
function onGrooveOperation(operation) {
    var output = '';
    for (var i = 0; i < operation.Trajectories.Count; i++) {
        const trajectory = operation.Trajectories[i];
        output += onGroovePath(operation, trajectory, trajectory.GroovePath);
    }
    return output;
}
function onNestOperation(operation) {
    var output = '';
    for (var i = 0; i < operation.Trajectories.Count; i++) {
        const trajectory = operation.Trajectories[i];
        output += onCountour(operation, trajectory, trajectory.NestContour);
    }
    return output;
}
function onMillCalibrationOperation(operation) {
    var output = '';
    for (var i = 0; i < operation.Trajectories.Count; i++) {
        const trajectory = operation.Trajectories[i];
        output += onCountour(operation, trajectory, trajectory.MillContour);
    }
    return output;
}
function onCutCalibrationOperation(operation) {
    var output = '';
    for (var i = 0; i < operation.Trajectories.Count; i++) {
        const trajectory = operation.Trajectories[i];
        const cutPath = trajectory.CutPaths;
        var scoringCutDepth = cutPath.MainPath.Depth;
        if (trajectory.ScoringEnabled) {
            scoringCutDepth = cutPath.ScoringPath.Depth;
        }
        output += onCutPath(operation, trajectory, cutPath.MainPath, scoringCutDepth);
    }
    return output;
}
function onMacroOperation(operation) {
    var output = '';
    return output;
}
function onCountour(operation, trajectory, contour) {
    var output = formatOrbitalLanding(operation, contour);

    var depths = stepoverDepths(trajectory.FullDepth, trajectory.Stepover);
    var startPoint = startContourPoint(contour, trajectory.FullDepth);

    if (contour.MainContour.IsClosed) {
        startPoint.Z = depths[0];
        output += formatContourStart(operation, contour, startPoint);
        depths.forEach(depth => {
            startPoint.Z = depth;
            output += formatLeadIn(contour.LeadIn, depth);
            output += formatContour(contour.MainContour, depth);
            output += formatLeadOut(contour.LeadOut, depth);
        });
    } else {
        depths.forEach(depth => {
            startPoint.Z = depth;
            output += formatContourStart(operation, contour, startPoint);
            output += formatLeadIn(contour.LeadIn, depth);
            output += formatContour(contour.MainContour, depth);
            output += formatLeadOut(contour.LeadOut, depth);
        });
    }
    return output;
}

function formatOrbitalLanding(operation, contour) {
    var orbitalLanding = contour.OrbitalLanding;
    if (!orbitalLanding.Exists) {
        return '';
    }

    var startPoint = pointPoint(orbitalLanding.Geometry[0]);
    var zForArc = startPoint.Z
    var centerPoint = lineStartPoint(orbitalLanding.Geometry[1]);

    var output = formatContourStartforOrbit(operation, contour, startPoint);
    var loops = orbitalLanding.FullDepth / orbitalLanding.Pitch;
    var totalAngle = Math.PI * 2.0 * loops;
    var arcCount = Math.ceil(loops);
    var oneArcAngle = totalAngle / arcCount;
    if (oneArcAngle >= Math.PI * 2.0) {
        arcCount++;
        oneArcAngle = totalAngle / arcCount;
    }
    var stepDown = orbitalLanding.FullDepth / arcCount;

    if (!orbitalLanding.Counterclockwise) {
        oneArcAngle = -oneArcAngle;
    }

    startPoint.Z = 0.0;
    centerPoint.Z = 0.0;
    var rotateVector = Spacial.CreateVector(centerPoint, startPoint);
    rotateVector.Z = 0.0;

    for (var i = 0; i < arcCount; i++) {
        rotateVector.RotationAroundZAxis(oneArcAngle);
        var endPoint = centerPoint.Copy();
        endPoint.TranslateBy(rotateVector);

        zForArc -= stepDown;
        var { iArc, jArc, arcDir } = calcArcData(centerPoint, startPoint, orbitalLanding.Counterclockwise);
        output += formatArc(endPoint, iArc, jArc, arcDir, zForArc);
        startPoint = endPoint;
    }

    var arcToLeadIn = orbitalLanding.Geometry[2];
    if (arcToLeadIn == undefined)
        return output;

    var leadEndPoint = arcEndPoint(arcToLeadIn);
    leadEndPoint.Z = 0.0;
    if (startPoint.IsEqualTo(leadEndPoint))
        return output;

    centerPoint = arcCenterPoint(arcToLeadIn);
    startPoint = arcStartPoint(arcToLeadIn);

    var { iArc, jArc, arcDir } = calcArcData(centerPoint, startPoint, orbitalLanding.Counterclockwise);
    endPoint = arcEndPoint(arcToLeadIn);
    output += formatArc(endPoint, iArc, jArc, arcDir, centerPoint.Z);
    return output;
}

function formatContourStartforOrbit(operation, contour, point) {
    var output = '';
    // W#89{ ::WTs
    output += formatOperationBlockStart(89, 's');
    output += formatToolDefinition(operation, false);
    var contourStartZ = point.Z;
    output += formatPoint(point, contourStartZ);
    output += formatCuttingParameters(operation.CuttingParameters);
    output += formatToolCompensation(contour);
    output += formatToolType(100);
    output += formatOperationBlockEnd();
    return writeLn(output);
}

function formatContourStart(operation, contour, point) {
    var output = '';
    // W#89{ ::WTs
    output += formatOperationBlockStart(89, 's');
    output += formatToolDefinition(operation, false);
    var contourStartZ = point.Z;
    if (contour.LeadIn.LeadType == LeadTypeEnum.Ramp) {
        contourStartZ = -geometryStartPoint(contour.LeadIn.Geometry[contour.LeadIn.Geometry.Count - 1]).Z;
    }
    output += formatPoint(point, -contourStartZ);
    output += formatCuttingParameters(operation.CuttingParameters);
    output += formatToolCompensation(contour);
    output += formatToolType(100);
    output += formatOperationBlockEnd();
    return writeLn(output);
}

function onCutPath(operation, trajectory, path) {
    if (path == null || path == undefined)
        return '';
    var startPoint;
    if (path.LeadIn.LeadType == LeadTypeEnum.Perpendicular) {
        startPoint = geometryStartPoint(path.Cut.Geometry[0]);
    }
    else {
        startPoint = geometryStartPoint(path.LeadIn.Geometry[0]);
    }
    var endPoint;
    if (path.LeadOut.LeadType == LeadTypeEnum.Perpendicular) {
        endPoint = geometryEndPoint(path.Cut.Geometry[0]);
    }
    else {
        endPoint = geometryEndPoint(path.LeadOut.Geometry[0]);
    }

    var scoringCutDepth = 0.0;
    if (trajectory.ScoringEnabled) {
        scoringCutDepth = trajectory.ScoringCutDepth;
    }
    else {
        scoringCutDepth = trajectory.Depth;
    }
    var toolCompensation = cutToolCompensation(path, trajectory.CutFromInside);
    var cutVector = lineDirection(path.Cut.Geometry[0]);
    var xVec = Spacial.CreateVector(1.0, 0.0, 0.0);
    if (cutVector.IsParallelTo(xVec) && operation.OperatingToolData.TiltAngle == Math.PI / 2.0) {
        return formatSawX(operation, startPoint, endPoint, trajectory.Depth, scoringCutDepth, 0.0, toolCompensation, true);
    }

    var yVec = Spacial.CreateVector(0.0, 1.0, 0.0);
    if (cutVector.IsParallelTo(yVec) && operation.OperatingToolData.TiltAngle == Math.PI / 2.0) {
        return formatSawY(operation, startPoint, endPoint, trajectory.Depth, scoringCutDepth, 0.0, toolCompensation, true);
    }

    if (operation.OperatingToolData.TiltAngle == Math.PI / 2.0) {
        return formatSawXY(operation, startPoint, endPoint, trajectory.Depth, scoringCutDepth, 0.0, toolCompensation, true);
    }
    else {
        return formatSawAngular(operation, startPoint, endPoint, trajectory.Depth, scoringCutDepth, 0.0, toolCompensation, true);
    }
}

function onGroovePath(operation, trajectory, path) {
    if (path == null || path == undefined)
        return '';
    var startPoint;
    if (path.LeadIn.LeadType == LeadTypeEnum.Perpendicular) {
        startPoint = geometryStartPoint(path.Cut.Geometry[0]);
    }
    else {
        startPoint = geometryStartPoint(path.LeadIn.Geometry[0]);
    }
    var endPoint;
    if (path.LeadOut.LeadType == LeadTypeEnum.Perpendicular) {
        endPoint = geometryEndPoint(path.Cut.Geometry[0]);
    }
    else {
        endPoint = geometryEndPoint(path.LeadOut.Geometry[0]);
    }
    var toolCompensation = grooveToolCompensation(path);
    var cutVector = lineDirection(path.Cut.Geometry[0]);

    var xVec = Spacial.CreateVector(1.0, 0.0, 0.0);
    if (cutVector.IsParallelTo(xVec) && operation.OperatingToolData.TiltAngle == Math.PI / 2.0) {
        return formatSawX(operation, startPoint, endPoint, trajectory.Depth, trajectory.Depth, trajectory.Width, toolCompensation, true);
    }

    var yVec = Spacial.CreateVector(0.0, 1.0, 0.0);
    if (cutVector.IsParallelTo(yVec) && operation.OperatingToolData.TiltAngle == Math.PI / 2.0) {
        return formatSawY(operation, startPoint, endPoint, trajectory.Depth, trajectory.Depth, trajectory.Width, toolCompensation, true);
    }

    if (operation.OperatingToolData.TiltAngle == Math.PI / 2.0) {
        return formatSawXY(operation, startPoint, endPoint, trajectory.Depth, trajectory.Depth, trajectory.Width, toolCompensation, true);
    }
    else {
        return formatSawAngular(operation, startPoint, endPoint, trajectory.Depth, trajectory.Depth, trajectory.Width, toolCompensation, true);
    }
}
function cutToolCompensation(path, fromInside) {
    var toolCompensation = 0;

    switch (path.OffsetSide) {
        case OffsetSideEnum.Left:
            toolCompensation = fromInside ? 1 : 2;
            break;
        case OffsetSideEnum.Right:
            toolCompensation = fromInside ? 2 : 1;
            break;
        case OffsetSideEnum.Center:
            toolCompensation = 0;
            break;
    }
    return toolCompensation;
}
function grooveToolCompensation(path) {
    var toolCompensation = 0;

    switch (path.OffsetSide) {
        case OffsetSideEnum.Left:
            toolCompensation = 2;
            break;
        case OffsetSideEnum.Right:
            toolCompensation = 1;
            break;
        case OffsetSideEnum.Center:
            toolCompensation = 0;
            break;
    }
    return toolCompensation;
}

function stepoverDepths(depth, stepover) {
    var depths = [];
    if (stepover == 0.0) {
        depths.push(depth);
        return depths;
    }

    var index = 1;
    var stepDepth = stepover * index;
    while (stepDepth < depth) {
        var d = depth - stepDepth;
        if (Math.abs(d) < 0.0001)
            d = 0.0;
        depths.push(d);
        index++;;
        stepDepth = stepover * index;
    }

    if (!depths.includes(depth)) {
        depths.push(depth);
    }
    return depths.sort();
}

function startContourPoint(contour, depth) {
    var geometry = contour.LeadIn.Geometry[0];
    var point = geometryStartPoint(geometry);
    if (contour.LeadIn.LeadType != LeadTypeEnum.Ramp) {
        point.Z = depth;
    }
    return point;
}

function pointPoint(geometry) {
    return getPoint(geometry);
}

function lineStartPoint(geometry) {
    var line = host.asType(Segment, geometry);
    var pointPos = pointByPos(line, 'Start');
    return getPoint(pointPos);
}

function lineEndPoint(geometry) {
    var line = host.asType(Segment, geometry);
    var pointPos = pointByPos(line, 'End');
    return getPoint(pointPos);
}

function lineDirection(geometry) {
    var line = host.asType(Segment, geometry);
    var vector = getVector(line.Direction);
    return vector;
}

function arcStartPoint(geometry) {
    var arc = host.asType(Arc, geometry);
    var pointPos = pointByPos(arc, 'Start');
    return getPoint(pointPos);
}

function arcCenterPoint(geometry) {
    var arc = host.asType(Arc, geometry);
    var pointPos = pointByPos(arc, 'Center');
    return getPoint(pointPos);
}

function arcEndPoint(geometry) {
    var arc = host.asType(Arc, geometry);
    var pointPos = pointByPos(arc, 'End');
    return getPoint(pointPos);
}

function arcCounterclockwise(geometry) {
    var arc = host.asType(Arc, geometry);
    return arc.Counterclockwise;
}

function arcData(geometry) {
    var center = arcCenterPoint(geometry);
    var start = arcStartPoint(geometry);
    var dir = arcCounterclockwise(geometry);
    return calcArcData(center, start, dir);
}
function geometryStartPoint(geometry) {
    var point;
    switch (geometry.GeometryType) {
        case GeometryTypeEnum.Point:
            point = pointPoint(geometry);
            break;
        case GeometryTypeEnum.Segment:
            point = lineStartPoint(geometry);
            break;
        case GeometryTypeEnum.Arc:
            point = arcStartPoint(geometry);
            break;
    }
    return point;
}
function geometryEndPoint(geometry) {
    var point;
    switch (geometry.GeometryType) {
        case GeometryTypeEnum.Point:
            point = pointPoint(geometry);
            break;
        case GeometryTypeEnum.Segment:
            point = lineEndPoint(geometry);
            break;
        case GeometryTypeEnum.Arc:
            point = arcEndPoint(geometry);
            break;
    }
    return point;
}
function calcArcData(center, start, dir) {
    var iArc = (center.X - start.X);
    var jArc = (center.Y - start.Y);
    var arcDir;
    if (currentSideNumber == 1 || currentSideNumber == 3 || currentSideNumber == 4) {
        arcDir = dir ? 1 : 0;
    }
    else {
        arcDir = dir ? 0 : 1;
    }
    return { iArc, jArc, arcDir };
}
function pointByPos(point, pos) {
    switch (pos.toUpperCase()) {
        case 'START':
            return point.StartPoint;
        case 'END':
            return point.EndPoint;
        case 'CENTER':
            return point.CenterPoint;
        default:
            return point;
    }
}
function getPoint(point) {
    var pt = host.asType(Point, point);
    return pt.ToReferenceCoordinateSystem();
}
function getVector(vector) {
    var vec = host.asType(Vector, vector);
    return vec.ToReferenceCoordinateSystem();
}
function remapNameAndNumbers(sides) {
    var zAxis = Spacial.CreateVector(0.0, 0.0, -1.0);
    for (var i = 0; i < sides.Count; i++) {
        if (sides[i].Name == 'Top') {
            sides[i].RemappedName = 'upper face';
            sides[i].RemappedNumber = 1;
            continue;
        }
        if (sides[i].Name == 'Back') {
            sides[i].RemappedName = 'back face';
            sides[i].RemappedNumber = 5;
            continue;
        }
        if (sides[i].Name == 'Front') {
            sides[i].RemappedName = 'front face';
            sides[i].RemappedNumber = 3;
            continue;
        }
        if (sides[i].Name == 'Left') {
            sides[i].RemappedName = 'left face';
            sides[i].RemappedNumber = 6;
            continue;
        }
        if (sides[i].Name == 'Right') {
            sides[i].RemappedName = 'right face';
            sides[i].RemappedNumber = 4;
            continue;
        }

        if (sides[i].Zaxis.IsSameDirection(zAxis)) {
            sides[i].RemappedName = 'below face';
            sides[i].RemappedNumber = 2;
            continue;
        }
        sides[i].RemappedName = 'custom face';
    }

    var repamedSides = new Array();
    repamedSides.push(...sides);
    repamedSides.sort((a, b) => a.RemappedNumber - b.RemappedNumber);

    // check custom sides numbering
    var customSides = repamedSides.filter(side => side.InclinedPlane);
    var minRemappedNumber = Math.min(...customSides.map(side => side.RemappedNumber));
    if (minRemappedNumber < 7) {
        var diff = 7 - minRemappedNumber;
        customSides.forEach(side => { side.RemappedNumber = side.RemappedNumber + diff });
    }

    return repamedSides;
}
function usedSides(sides) {
    var output = '';
    for (var i = 0; i < sides.length; i++) {
        if (sides[i].OperationsCount > 0)
            output += sides[i].RemappedNumber + ';'
    }
    return output;
}

function formatSawX(operation, startPoint, endPoint, cutDepth, scoringDepth, cutWidth, toolCompensation, landing) {
    // W#1050{ ::WT2
    var output = formatOperationBlockStart(1050, '2');
    output += ' #8098=..\\custom\\mcr\\lame.tmcr #6=1';
    output += formatSawCoordinate('#8503', cutWidth);
    output += ' #8509=0';
    output += formatSawCoordinate('#8510', startPoint.X);
    output += formatSawCoordinate('#8511', startPoint.Y);
    output += formatSawDepth(cutDepth, scoringDepth); // 8512
    output += ' #8514=1 #8515=1';
    output += formatSawToolDefinition(operation.Spindle.Code); // 8516
    output += formatSawCoordinate('#8517', endPoint.X);
    output += formatSawToolCompensation(toolCompensation); // 8525
    output += formatSawScoringDepth(cutDepth, scoringDepth); // 8526
    output += formatSawPrevetLanding(landing); // 8527
    // //output += formatSawCuttingParameters(operation.CuttingParameters);
    output += formatOperationBlockEnd();
    return writeLn(output);
}
function formatSawY(operation, startPoint, endPoint, cutDepth, scoringDepth, cutWidth, toolCompensation, landing) {
    // W#1051{ ::WT2
    var output = formatOperationBlockStart(1051, '2');
    output += ' #8098=..\\custom\\mcr\\lame.tmcr #6=1';
    output += formatSawCoordinate('#8503', cutWidth);
    output += ' #8509=1';
    output += formatSawCoordinate('#8510', startPoint.X);
    output += formatSawCoordinate('#8511', startPoint.Y);
    output += formatSawDepth(cutDepth, scoringDepth); // 8512
    output += ' #8514=1 #8515=1';
    output += formatSawToolDefinition(operation.Spindle.Code); // 8516
    output += formatSawCoordinate('#8518', endPoint.Y);
    output += formatSawToolCompensation(toolCompensation); // 8525
    output += formatSawScoringDepth(cutDepth, scoringDepth); // 8526
    output += formatSawPrevetLanding(landing); // 8527
    //output += formatSawCuttingParameters(operation.CuttingParameters);
    output += formatOperationBlockEnd();
    return writeLn(output);
}
function formatSawXY(operation, startPoint, endPoint, cutDepth, scoringDepth, cutWidth, toolCompensation, landing) {
    // W#1052{ ::WT2
    var output = formatOperationBlockStart(1052, '2');
    output += ' #8098=..\\custom\\mcr\\lame.tmcr #6=1';
    output += formatSawCoordinate('#8503', cutWidth);
    output += ' #8504 = subang #8508=0';
    output += ' #8509=2';
    output += formatSawCoordinate('#8510', startPoint.X);
    output += formatSawCoordinate('#8511', startPoint.Y);
    output += formatSawDepth(cutDepth, scoringDepth); // 8512
    output += ' #8514=1 #8515=1';
    output += formatSawToolDefinition(operation.Spindle.Code); // 8516
    output += formatSawCoordinate('#8517', endPoint.X);
    output += formatSawCoordinate('#8518', endPoint.Y);
    output += ' #8521=90.0'; //Angle Beta, tilting of the saw blade
    output += formatSawToolCompensation(toolCompensation); // 8525
    output += formatSawScoringDepth(cutDepth, scoringDepth); // 8526
    output += formatSawPrevetLanding(landing); // 8527
    output += ' #8531=0'; // If = 1 defined as nesting geometry
    output += ' #8532=0'; // If =1 defined as leftover area for nesting calculation
    output += ' #8533=1'; // Enable X/Y final position (module and alfa angle are auto. disabled)
    output += ' #8535=0'; // ???
    //output += formatSawCuttingParameters(operation.CuttingParameters);
    output += formatOperationBlockEnd();
    return writeLn(output);
}
function formatSawAngular(operation, startPoint, endPoint, cutDepth, scoringDepth, cutWidth, toolCompensation, landing) {
    // W#1052{ ::WT2
    var output = formatOperationBlockStart(1052, '2');
    output += ' #8098=..\\custom\\mcr\\lame.tmcr #6=1';
    output += formatSawCoordinate('#8503', cutWidth);
    output += ' #8504 = subang #8508=0';
    output += ' #8509=2';
    output += formatSawCoordinate('#8510', startPoint.X);
    output += formatSawCoordinate('#8511', startPoint.Y);
    output += formatSawDepth(cutDepth, scoringDepth); // 8512
    output += ' #8514=1 #8515=1';
    output += formatSawToolDefinition(operation.Spindle.Code); // 8516
    output += formatSawCoordinate('#8517', endPoint.X);
    output += formatSawCoordinate('#8518', endPoint.Y);
    output += formatSawTiltAngle(operation.OperatingToolData.TiltAngle); //Angle Beta, tilting of the saw blade
    output += formatSawToolCompensation(toolCompensation); // 8525
    output += formatSawScoringDepth(cutDepth, scoringDepth); // 8526
    output += formatSawPrevetLanding(landing); // 8527
    output += ' #8531=0'; // If = 1 defined as nesting geometry
    output += ' #8532=0'; // If =1 defined as leftover area for nesting calculation
    output += ' #8533=1'; // Enable X/Y final position (module and alfa angle are auto. disabled)
    output += ' #8535=0'; // ???
    //output += formatSawCuttingParameters(operation.CuttingParameters);
    output += formatOperationBlockEnd();
    return writeLn(output);
}
function formatLeadIn(lead, depth) {
    var output = '';
    switch (lead.LeadType) {
        case LeadTypeEnum.Direct:
            break;
        case LeadTypeEnum.Tangent:
        case LeadTypeEnum.Arc:
        case LeadTypeEnum.Ramp:
            output += formatGeometry(lead.Geometry, -depth);
            break;
    }
    return output;
}
function formatLeadOut(lead, depth) {
    var output = '';
    switch (lead.LeadType) {
        case LeadTypeEnum.Direct:
            break;
        case LeadTypeEnum.Tangent:
        case LeadTypeEnum.Arc:
            output += formatGeometry(lead.Geometry, -depth);
            break;
        case LeadTypeEnum.Ramp:
            var startPoint = geometryEndPoint(lead.Geometry[lead.Geometry.Count - 1]);
            output += formatGeometry(lead.Geometry, startPoint.Z);
            break;
    }
    return output;
}
function formatContour(contour, depth) {
    return formatGeometry(contour.Geometry, -depth);
}
function formatGeometry(geometry, depth) {
    var output = '';
    var point;
    for (var index = 0; index < geometry.Count; index++) {
        var geom = geometry[index];
        switch (geom.GeometryType) {
            case GeometryTypeEnum.Point:
                point = pointPoint(geom, depth);
                output += formatPoint(point, depth);
                break;
            case GeometryTypeEnum.Segment:
                point = lineEndPoint(geom);
                output += formatLine(point, depth);
                break;
            case GeometryTypeEnum.Arc:
                point = arcEndPoint(geom);
                var { iArc, jArc, arcDir } = arcData(geom);
                output += formatArc(point, iArc, jArc, arcDir, depth);
                break;
        }
    }
    return output;
}
function formatToolType(type) {
    return ' #1001=' + intFormat.Output(type);
}
function formatToolDefinition(operation, defaults) {
    var output = '';
    if (operation.Spindle.ToolIdentifiedBy == ToolSpecifyingEnum.ByHoleDiameter) {
        output += ' #1002=' + doubleFormat.Output(operation.Spindle.Tool.Diameter);
    }
    else {
        output += ' #205=' + operation.Spindle.Code;
    }

    if (defaults) {
        output += ' #201=1 #203=1';
    }
    return output;
}
function formatSawToolDefinition(code) {
    var output = ' #8516=' + code;
    return output;
}
function formatHeader(clamping, sides) {
    var output = writeLn('TPA\\ALBATROS\\EDICAD\\02.00');
    output += writeLn('$=Generated by Woodwork for Inventor CAM');
    output += writeLn('$=' + mandatorySettings.fileExtension + ' ' + mandatorySettings.description);
    output += writeLn('::SIDE=' + usedSides(sides));
    output += writeLn('::' + (mandatorySettings.unit == 'mm' ? 'UNm' : 'UNi') +
        ' DL=' + doubleFormat.Output(clamping.Part.Length) +
        ' DH=' + doubleFormat.Output(clamping.Part.Width) +
        ' DS=' + doubleFormat.Output(clamping.Part.Thickness));
    output += writeLn('::FLT0=0 FLT1=0 FLT2=0 FLT3=0 FLT4=0 FLT5=0 FLT6=0 FLT7=0');
    return output;
}
function formatExecutionSection() {
    var output = writeLn('EXE{');
    output += writeLn('#0=0'); // Execution mode, 0= normal, 1= mirror in X, affects the setting mirror in CNC Board
    output += writeLn('#1=0'); // Work area, 0=N; 1=M; 2=S; 5=R; 6=N1;7=M1, area definition if program is called in CNC Board
    output += writeLn('#2=0'); // Locator offset X; not managed
    output += writeLn('#3=0'); // Locator offset Y; not managed
    output += writeLn('#4=0'); // Locator offset Z; not managed
    output += writeLn('}EXE');
    return output;
}
function formatVariablesSection() {
    var output = writeLn('OFFS{'); // variables “o” section. “o” variables could be maximum 8
    output += writeLn('#0=0|0');
    output += writeLn('#1=0|0');
    output += writeLn('#2=0|0');
    output += writeLn('}OFFS');

    output += writeLn('VARV{'); // variables “v” section. “v” variables could be maximum 8
    output += writeLn('#0=1|1');
    output += writeLn('#1=2|2');
    output += writeLn('#2=3|3');
    output += writeLn('#3=4|4');
    output += writeLn('#4=0|0');
    output += writeLn('#5=0|0');
    output += writeLn('#6=0|0');
    output += writeLn('#7=0|0');
    output += writeLn('}VARV');

    output += writeLn('VAR{'); // variables “r” section. “r” variables could be maximum 300
    output += writeLn('}VAR');

    output += writeLn('SPEC{'); //  defines which of the defined tool outfit is used
    output += writeLn('}SPEC');

    output += writeLn('INFO{');
    output += writeLn('}INFO');
    return output;
}
function formatOptimizationSection() {
    var output = writeLn('OPTI{'); // possible to change the execution sequence of the program
    output += writeLn('::OPTDEF=1 OPTIMIZE=%;0 OPTMIN=0 OPT3=0 OPT0=0 OPTTOOL=0 OPT2=0 OPTX=0 OPTY=0 OPTR=0 OPT4=0 OPT6=0 OPT7=0 LSTCOD=0%1%2%3 LTOOLFR=0 LTOOLPN=0 OPTF1=0 OOO=0.5');
    output += writeLn('}OPTI');
    output += writeLn('LINK{');
    output += writeLn('}LINK');
    return output;
}

function formatFictitiousFacesSection(sides) {
    var output = '';
    var customSides = sides.filter(s => s.InclinedPlane);
    if (customSides.length == 0)
        return output;

    output += writeLn('GEO{ ::NF=' + intFormat.Output(customSides.length));
    for (var i = 0; i < customSides.length; i++) {
        var side = customSides[i];
        var extData = side.ExtendedData;
        if (extData == null || extData == undefined)
            continue;

        ReferenceCoordinateSystem.SetToSide(side.Name);
        output += writeLn('GSIDE#' + intFormat.Output(side.RemappedNumber) + '{ ::NR=1');
        output += writeLn('$=' + side.RemappedName); // + ' ' + intFormat.Output(side.RemappedNumber));
        output += writeLn(
            '#1=' + doubleFormat.Output(extData.P1.X) +
            '|' + doubleFormat.Output(extData.P1.Y) +
            '|' + doubleFormat.Output(extData.P1.Z));
        output += writeLn(
            '#2=' + doubleFormat.Output(extData.P2.X) +
            '|' + doubleFormat.Output(extData.P2.Y) +
            '|' + doubleFormat.Output(extData.P2.Z));
        output += writeLn(
            '#3=' + doubleFormat.Output(extData.P3.X) +
            '|' + doubleFormat.Output(extData.P3.Y) +
            '|' + doubleFormat.Output(extData.P3.Z));
        output += writeLn('#Z=sf');
        output += writeLn('}GSIDE');
    }
    output += writeLn('}GEO');
    return output;
}

function formatOperationBlockStart(operationCode, workType) {
    return 'W#' + intFormat.Output(operationCode) + '{ ::WT' + workType;
}
function formatOperationBlockEnd() {
    return ' }W';
}
function formatSideBlockStart(side) {
    var output = writeLn('SIDE#' + intFormat.Output(side.RemappedNumber) + '{');
    output += writeLn('$=' + side.RemappedName);
    return output;
}
function formatSideBlockEnd() {
    return writeLn('}SIDE');
}
function formatToolCompensation(contour) {
    var toolCompensation = 0;
    if (contour.OffsetType == TrajectoryOffsetTypeEnum.Software) {
        toolCompensation = 0;
    }
    else {
        switch (contour.OffsetSide) {
            case OffsetSideEnum.Left:
                if (currentSideNumber == 6 || currentSideNumber == 5) {
                    toolCompensation = 2;
                }
                else {
                    toolCompensation = 1;
                }
                break;
            case OffsetSideEnum.Right:
                if (currentSideNumber == 6 || currentSideNumber == 5) {
                    toolCompensation = 1;
                }
                else {
                    toolCompensation = 2;
                }
                break;
            case OffsetSideEnum.Center:
                toolCompensation = 0;
                break;
        }
    }
    return ' #40=' + intFormat.Output(toolCompensation);
}
function formatSawDepth(cutDepth, scoringDepth) {
    var output = '';
    if (scoringDepth == cutDepth) {
        output += formatSawCoordinate('#8512', -cutDepth);
    }
    else {
        output += formatSawCoordinate('#8512', -scoringDepth); // Depth start
        output += formatSawCoordinate('#8513', -cutDepth); // Depth of the second step of the working 
    }
    return output;
}
function formatSawToolCompensation(toolCompensation) {
    return ' #8525=' + intFormat.Output(toolCompensation);
}
function formatSawScoringDepth(cutDepth, scoringDepth) {
    if (scoringDepth == cutDepth) {
        return ' #8526=0';
    }
    else {
        return ' #8526=1';
    }
}
function formatSawPrevetLanding(landing) {
    if (landing) {
        return ' #8527=0';
    }
    else {
        return ' #8527=1';
    }
}
function formatSawTiltAngle(angle) {
    return ' #8521=' + angleFormat.Output(angle);
}
function formatCuttingParameters(cuttingParameters) {
    var output = '';
    if (cuttingParameters.CuttingFeedrate != 0) {
        output += ' #2005=' + feedFormat.Output(cuttingParameters.CuttingFeedrate);
    }
    if (cuttingParameters.Speed != 0) {
        output += ' #2002=' + rpmFormat.Output(cuttingParameters.Speed);
    }
    return output;
}
function formatSawCuttingParameters(cuttingParameters) {
    var output = '';
    if (cuttingParameters.CuttingFeedrate != 0) {
        output += ' #8524=' + feedFormat.Output(cuttingParameters.CuttingFeedrate);
    }
    if (cuttingParameters.Speed != 0) {
        output += ' #8522=' + rpmFormat.Output(cuttingParameters.Speed);
    }
    return output;
}
function formatPoint(point, depth) {
    return ' #1=' + doubleFormat.Output(point.X) +
        ' #2=' + doubleFormat.Output(point.Y) +
        ' #3=' + doubleFormat.Output(depth) +
        ' #8015=0';
}
function formatLine(point, depth) {
    var output = 'W#2201{ ::WTl' +
        formatPoint(point, depth) +
        formatOperationBlockEnd();
    return writeLn(output);
}
function formatArc(point, i, j, dir, depth) {
    var output = 'W#2101{ ::WTa' +
        formatPoint(point, depth) +
        ' #31=' + doubleFormat.Output(i) +
        ' #32=' + doubleFormat.Output(j) +
        ' #34=' + intFormat.Output(dir) +
        formatOperationBlockEnd();
    return writeLn(output);
}
function formatSawCoordinate(commandCode, value) {
    return ' ' + commandCode + '=' + doubleFormat.Output(value);
}
function writeLn(line) {
    if (line.length == 0)
        return '';
    return line + newLineChar;
}