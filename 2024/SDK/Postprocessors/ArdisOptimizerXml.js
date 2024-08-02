/*
  Copyright (C) 2021-2024 by Celi APS, Inc.
  All rights reserved.

  ARDIS OPTIMIZER xml postprocessor

  Date: 2022-07-01
*/

export var mandatorySettings = {
    description: 'ARDIS XML',
    legal: 'Copyright (C) 2021-2024 by Celi APS, Inc.',
    longDescription: 'ARDIS OPTIMIZER XML post',
    certificationLevel: 2,
    minimumRevision: 5,
    fileExtension: 'xml',
    setCodePage: 'ascii',
    unit: 'mm',
    operationSort: 'ByOrder'
};

var doubleFormat = Utility.CreateFormat({ decimals: 4, trim: true, forceDecimal: false, scale: mandatorySettings.unit });
var intFormat = Utility.CreateFormat({ decimals: 0, trim: true, forceDecimal: false, scale: 1 });
var degAngle = Utility.CreateFormat({ decimals: 4, trim: true, forceDecimal: false, scale: 'deg' });

var newLineChar = '\n';
var tagStack = [];
var polylineId = 0;
var sequenceId = 0;

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
        Spacial.CreateVector(0.0, 1.0, 0.0)));
    transforms.push(Spacial.CreateCoordinateSystem(
        'Back',
        Spacial.CreatePoint(sizes.Length, sizes.Width, -sizes.Thickness),
        Spacial.CreateVector(-1.0, 0.0, 0.0),
        Spacial.CreateVector(0.0, 0.0, 1.0),
        Spacial.CreateVector(0.0, -1.0, 0.0)));
    transforms.push(Spacial.CreateCoordinateSystem(
        'Left',
        Spacial.CreatePoint(0.0, sizes.Width, -sizes.Thickness),
        Spacial.CreateVector(0.0, -1.0, 0.0),
        Spacial.CreateVector(0.0, 0.0, 1.0),
        Spacial.CreateVector(1.0, 0.0, 0.0)));
    transforms.push(Spacial.CreateCoordinateSystem(
        'Right',
        Spacial.CreatePoint(sizes.Length, 0.0, -sizes.Thickness),
        Spacial.CreateVector(0.0, 1.0, 0.0),
        Spacial.CreateVector(0.0, 0.0, 1.0),
        Spacial.CreateVector(-1.0, 0.0, 0.0)));
    transforms.push(Spacial.CreateCoordinateSystem(
        'Bottom',
        Spacial.CreatePoint(sizes.Length, sizes.Width, -sizes.Thickness),
        Spacial.CreateVector(-1.0, 0.0, 0.0),
        Spacial.CreateVector(0.0, -1.0, 0.0),
        Spacial.CreateVector(0.0, 0.0, -1.0)));
    return transforms;
}

export function onPostprocess() {
    var content = '';
    var uniqueClampName = '';
    for (var index = 0; index < Job.Clampings.Count; index++) {
        content += onClamping(Job.Clampings[index]);
        if (content == null || content == undefined) {
            continue;
        }
        uniqueClampName = Job.Clampings[index].Name;
        if (uniqueClampName == '') {
            uniqueClampName = (Job.OutputOptions.CalledFromNesting ? 'Nest' : 'Clamp') + index;
        }
        Utility.WriteOutput(uniqueClampName, content);
    }
}
function onClamping(clamp) {
    var output = '';
    if (clamp == null || clamp == undefined)
        return output;
    if (clamp.Operations.Count == 0)
        return output;

    ReferenceCoordinateSystem.SetToClamping(clamp.Name);
    for (var index = 0; index < clamp.Operations.Count; index++) {
        output += onOperation(clamp.Operations[index]);
    }
    if (output == '')
        return output;
    return openTag('PartDraw') + output + closeTag();
}

function onOperation(operation) {
    var output = '';
    if (operation == null || operation == undefined)
        return output;
    var zVector = Spacial.CreateVector(0.0, 0.0, 1.0);
    var xVector = Spacial.CreateVector(1.0, 0.0, 0.0);
    var yVector = Spacial.CreateVector(0.0, 1.0, 0.0);
    if (!zVector.IsParallelTo(operation.Side.Zaxis) && !xVector.IsParallelTo(operation.Side.Zaxis) && !yVector.IsParallelTo(operation.Side.Zaxis))
        return output; // reject slant sides

    ReferenceCoordinateSystem.SetToSide(operation.Side.Zaxis);

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
        case OperationTypeEnum.CutCalibrationOperation:
        case OperationTypeEnum.CalibrationOperation:
        case OperationTypeEnum.MacroOperation:
            break;
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
function onCountour(operation, trajectory, contour) {
    const opType = intFormat.Output(1); // 1-Mill
    var tool = toolCode(operation);
    var opSide = intFormat.Output(getOpside(contour));
    var side = intFormat.Output(getSide(operation.Side.Zaxis));
    var output = formatOrbitalLanding(contour.OrbitalLanding, tool, opType, opSide, side);
    var depths = stepoverDepths(trajectory.FullDepth, trajectory.Stepover);
    depths.forEach(depth => {
        polylineId++;
        sequenceId = 0;
        output += formatLeadIn(contour.LeadIn, tool, depth, opType, opSide, side);
        output += formatContour(contour.MainContour, tool, depth, opType, opSide, side);
        output += formatLeadOut(contour.LeadOut, tool, depth, opType, opSide, side);
    });
    return output;
}
function formatOrbitalLanding(orbitalLanding, tool, opType, opSide, side) {
    if (!orbitalLanding.Exists)
        return '';

    var radius = orbitalLanding.Radius;
    var startPoint = geometryStartPoint(orbitalLanding.Geometry[0]);
    var zForArc = startPoint.Z;
    var centerPoint = geometryStartPoint(orbitalLanding.Geometry[1]);

    var loops = orbitalLanding.FullDepth / orbitalLanding.Pitch;
    var totalAngle = Math.PI * 2.0 * loops;
    var arcCount = Math.ceil(loops);
    var oneArcAngle = totalAngle / arcCount;
    if (oneArcAngle >= Math.PI * 2.0) {
        arcCount++;
        oneArcAngle = totalAngle / arcCount;
    }
    var dir = arcDrawDir(orbitalLanding.Counterclockwise, oneArcAngle);
    var stepDown = orbitalLanding.FullDepth / arcCount;
    if (!orbitalLanding.Counterclockwise) {
        oneArcAngle = -oneArcAngle;
    }
    startPoint.Z = 0.0;
    centerPoint.Z = 0.0;
    var rotateVector = Spacial.CreateVector(centerPoint, startPoint);
    rotateVector.Z = 0.0;

    var output = '';
    polylineId++;
    sequenceId = 1;
    var depth1 = 0.0;
    var depth2 = 0.0;
    for (var i = 0; i < arcCount; i++) {
        rotateVector.RotationAroundZAxis(oneArcAngle);
        var endPoint = centerPoint.Copy();
        endPoint.TranslateBy(rotateVector);
        var length = endPoint.X - startPoint.X;
        var widht = endPoint.Y - startPoint.Y;
        zForArc += stepDown;
        depth2 = zForArc;

        output += openTag('Draw');
        output += openCloseTag('FUNCTNAME', 'ARC');
        output += openCloseTag('X', doubleFormat.Output(startPoint.X));
        output += openCloseTag('Y', doubleFormat.Output(startPoint.Y));
        output += openCloseTag('LENGTH', doubleFormat.Output(length));
        output += openCloseTag('WIDTH', doubleFormat.Output(widht));
        output += openCloseTag('RADIUS', doubleFormat.Output(radius));
        output += openCloseTag('DIR', intFormat.Output(dir));
        if (depth1 != depth2)
            output += openCloseTag('Z1', doubleFormat.Output(depth1));
        output += openCloseTag('Z2', doubleFormat.Output(depth2));
        if (tool != null && tool != undefined && tool != '')
            output += openCloseTag('TOOL', tool);
        output += openCloseTag('ID', intFormat.Output(polylineId));
        output += openCloseTag('SEQ', intFormat.Output(sequenceId));
        output += openCloseTag('OPSIDE', opSide);
        output += openCloseTag('OPTYPE', opType);
        output += openCloseTag('SIDE', side);
        output += closeTag();

        startPoint = endPoint;
        depth1 = zForArc;
        sequenceId++;
    }
    return output;
}
function formatLeadIn(lead, tool, depth, opType, opSide, side) {
    var output = '';
    switch (lead.LeadType) {
        case LeadTypeEnum.Direct:
            break;
        case LeadTypeEnum.Ramp:
            output += formatGeometry(lead.Geometry, tool, 0.0, depth, opType, opSide, side);
            break;
        case LeadTypeEnum.Tangent:
        case LeadTypeEnum.Arc:
            output += formatGeometry(lead.Geometry, tool, depth, depth, opType, opSide, side);
            break;
    }
    return output;
}
function formatLeadOut(lead, tool, depth, opType, opSide, side) {
    var output = '';
    switch (lead.LeadType) {
        case LeadTypeEnum.Direct:
            break;
        case LeadTypeEnum.Ramp:
            output += formatGeometry(lead.Geometry, tool, depth, 0.0, opType, opSide, side);
            break;
        case LeadTypeEnum.Tangent:
        case LeadTypeEnum.Arc:
            output += formatGeometry(lead.Geometry, tool, depth, depth, opType, opSide, side);
            break;
    }
    return output;
}
function formatContour(contour, tool, depth, opType, opSide, side) {
    return formatGeometry(contour.Geometry, tool, depth, depth, opType, opSide, side)
}
function formatGeometry(geometry, tool, depth1, depth2, opType, opSide, side) {
    var output = '';
    for (var index = 0; index < geometry.Count; index++) {
        var geom = geometry[index];
        switch (geom.GeometryType) {
            case GeometryTypeEnum.Point:
                break;
            case GeometryTypeEnum.Segment:
                sequenceId++;
                output += formatLine(geom, tool, depth1, depth2, opType, opSide, side);
                break;
            case GeometryTypeEnum.Arc:
                sequenceId++;
                output += formatArc(geom, tool, depth1, depth2, opType, opSide, side);
                break;
        }
    }
    return output;
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
function formatLine(geometry, tool, depth1, depth2, opType, opSide, side) {
    var startPoint = geometryStartPoint(geometry);
    var endPoint = geometryEndPoint(geometry);
    var length = endPoint.X - startPoint.X;
    var widht = endPoint.Y - startPoint.Y;
    var output = openTag('Draw');
    output += openCloseTag('FUNCTNAME', 'LINE');
    output += openCloseTag('X', doubleFormat.Output(startPoint.X));
    output += openCloseTag('Y', doubleFormat.Output(startPoint.Y));
    output += openCloseTag('LENGTH', doubleFormat.Output(length));
    output += openCloseTag('WIDTH', doubleFormat.Output(widht));
    if (depth1 != depth2)
        output += openCloseTag('Z1', doubleFormat.Output(depth1));
    output += openCloseTag('Z2', doubleFormat.Output(depth2));
    if (tool != null && tool != undefined && tool != '')
        output += openCloseTag('TOOL', tool);
    output += openCloseTag('ID', intFormat.Output(polylineId));
    output += openCloseTag('SEQ', intFormat.Output(sequenceId));
    output += openCloseTag('OPSIDE', opSide);
    output += openCloseTag('OPTYPE', opType);
    output += openCloseTag('SIDE', side);
    output += closeTag();
    return output;
}
function formatArc(geometry, tool, depth1, depth2, opType, opSide, side) {
    var arc = host.asType(Arc, geometry);
    var dir = arcDrawDir(arc.Counterclockwise, arc.Angle);
    var startPoint = geometryStartPoint(geometry);
    var endPoint = geometryEndPoint(geometry);
    var length = endPoint.X - startPoint.X;
    var widht = endPoint.Y - startPoint.Y;
    var output = openTag('Draw');
    output += openCloseTag('FUNCTNAME', 'ARC');
    output += openCloseTag('X', doubleFormat.Output(startPoint.X));
    output += openCloseTag('Y', doubleFormat.Output(startPoint.Y));
    output += openCloseTag('LENGTH', doubleFormat.Output(length));
    output += openCloseTag('WIDTH', doubleFormat.Output(widht));
    output += openCloseTag('RADIUS', doubleFormat.Output(arc.Radius));
    output += openCloseTag('DIR', intFormat.Output(dir));
    if (depth1 != depth2)
        output += openCloseTag('Z1', doubleFormat.Output(depth1));
    output += openCloseTag('Z2', doubleFormat.Output(depth2));
    if (tool != null && tool != undefined && tool != '')
        output += openCloseTag('TOOL', tool);
    output += openCloseTag('ID', intFormat.Output(polylineId));
    output += openCloseTag('SEQ', intFormat.Output(sequenceId));
    output += openCloseTag('OPSIDE', opSide);
    output += openCloseTag('OPTYPE', opType);
    output += openCloseTag('SIDE', side);
    output += closeTag();
    return output;
}
function onPockOperation(operation) {
    var output = '';
    for (var i = 0; i < operation.Trajectories.Count; i++) {
        const trajectory = operation.Trajectories[i];
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
function onDrillOperation(operation) {
    var diameter = doubleFormat.Output(operation.Spindle.Tool.Diameter);
    var tool = toolCode(operation);
    var side = intFormat.Output(getSide(operation.Side.Zaxis));
    var output = '';
    for (var i = 0; i < operation.Trajectories.Count; i++) {
        const trajectory = operation.Trajectories[i];
        var opSide = intFormat.Output(getOpside());
        for (var j = 0; j < trajectory.Geometry.Count; j++) {
            var point = getPoint(trajectory.Geometry[j]);
            output += openTag('Draw');
            output += openCloseTag('FUNCTNAME', 'DRILL');
            output += openCloseTag('X', doubleFormat.Output(point.X));
            output += openCloseTag('Y', doubleFormat.Output(point.Y));
            output += openCloseTag('DIAMETER', diameter);
            if (tool != null && tool != undefined && tool != '')
                output += openCloseTag('TOOL', tool);
            output += openCloseTag('Z2', doubleFormat.Output(trajectory.FullDepth));
            output += openCloseTag('OPSIDE', opSide);
            output += openCloseTag('SIDE', side);
            output += closeTag();
        }
    }
    return output;
}
function onCutOperation(operation) {
    var tool = toolCode(operation);
    var side = intFormat.Output(getSide(operation.Side.Zaxis));
    var output = '';
    for (var i = 0; i < operation.Trajectories.Count; i++) {
        const trajectory = operation.Trajectories[i];
        var sawWidth = doubleFormat.Output(trajectory.Width);
        var recalc = recalcCut(trajectory.CutPaths.MainPath, trajectory.Width);
        var startPoint = recalc.startPt;
        var angle = recalc.angle;
        var length = recalc.length;
        output += openTag('Draw');
        output += openCloseTag('FUNCTNAME', 'GROOVE');
        output += openCloseTag('X', doubleFormat.Output(startPoint.X));
        output += openCloseTag('Y', doubleFormat.Output(startPoint.Y));
        output += openCloseTag('LENGTH', length);
        output += openCloseTag('WIDTH', sawWidth);
        if (tool != null && tool != undefined && tool != '')
            output += openCloseTag('TOOL', tool);
        output += openCloseTag('Z2', doubleFormat.Output(trajectory.Depth));
        output += openCloseTag('OPSIDE', '2');
        if (angle != 0.0)
            output += openCloseTag('ANGLE', degAngle.Output(angle));
        output += openCloseTag('SIDE', side);
        output += closeTag();
    }
    return output;
}
function recalcCut(path, width) {
    var opside = intFormat.Output(getOpside(path));
    var startPoint = getGrooveStartPoint(path);
    var endPoint = getGrooveEndPoint(path);
    var length = doubleFormat.Output(startPoint.DistanceTo(endPoint));
    var cutDir = getGrooveDirection(path);

    // flip groove cutting path
    if (cutDir.Y <= 0.0 && cutDir.X != 1.0) {
        var tmp = startPoint.Copy();
        startPoint = endPoint.Copy();
        endPoint = tmp.Copy();
        if (opside == 0)
            opside = 1;
        else if (opside == 1)
            opside = 0;
        cutDir.ScaleBy(-1.0);
    }

    if (opside == 0) { // left 
        var shift = cutDir.Copy();
        shift.Normalize();
        shift.RotationAroundZAxis(-Math.PI * 0.5);
        shift.ScaleBy(width);
        startPoint.TranslateBy(shift);
        endPoint.TranslateBy(shift);
    }

    // center of groove chanell
    var halfGvoove = Spacial.CreateVector(startPoint, endPoint);
    halfGvoove.ScaleBy(0.5);
    var shift = cutDir.Copy();
    shift.Normalize();
    shift.RotationAroundZAxis(Math.PI * 0.5);
    shift.ScaleBy(width * 0.5);
    halfGvoove.X += shift.X;
    halfGvoove.Y += shift.Y;
    halfGvoove.Z += shift.Z;
    var centerGroove = startPoint.Copy();
    centerGroove.TranslateBy(halfGvoove);

    var toNewStart = Spacial.CreateVector(centerGroove, startPoint);
    var angle = cutDir.AngleTo(Spacial.CreateVector(1.0, 0.0, 0.0));
    toNewStart.RotationAroundZAxis(-angle);
    centerGroove.TranslateBy(toNewStart);
    var startPoint = centerGroove;

    return {
        "startPt": startPoint,
        "angle": angle,
        "length": length
    };
}
function onGrooveOperation(operation) {
    var tool = toolCode(operation);
    var side = intFormat.Output(getSide(operation.Side.Zaxis));
    var output = '';
    for (var i = 0; i < operation.Trajectories.Count; i++) {
        const trajectory = operation.Trajectories[i];
        var sawWidth = doubleFormat.Output(trajectory.Width);
        var recalc = recalcGroove(trajectory.GroovePath, trajectory.Width);
        var startPoint = recalc.startPt;
        var angle = recalc.angle;
        var length = recalc.length;
        output += openTag('Draw');
        output += openCloseTag('FUNCTNAME', 'GROOVE');
        output += openCloseTag('X', doubleFormat.Output(startPoint.X));
        output += openCloseTag('Y', doubleFormat.Output(startPoint.Y));
        output += openCloseTag('LENGTH', length);
        output += openCloseTag('WIDTH', sawWidth);
        if (tool != null && tool != undefined && tool != '')
            output += openCloseTag('TOOL', tool);
        output += openCloseTag('Z2', doubleFormat.Output(trajectory.Depth));
        output += openCloseTag('OPSIDE', '2');
        if (angle != 0.0)
            output += openCloseTag('ANGLE', degAngle.Output(angle));
        output += openCloseTag('SIDE', side);
        output += closeTag();
    }
    return output;
}
function recalcGroove(path, width) {
    var opside = intFormat.Output(getOpside(path));
    var startPoint = getGrooveStartPoint(path);
    var endPoint = getGrooveEndPoint(path);
    var length = doubleFormat.Output(startPoint.DistanceTo(endPoint));
    var cutDir = getGrooveDirection(path);

    // flip groove cutting path
    if (cutDir.Y <= 0.0 && cutDir.X != 1.0) {
        var tmp = startPoint.Copy();
        startPoint = endPoint.Copy();
        endPoint = tmp.Copy();
        if (opside == 0)
            opside = 1;
        else if (opside == 1)
            opside = 0;
        cutDir.ScaleBy(-1.0);
    }

    if (opside == 0) { // left 
        var shift = cutDir.Copy();
        shift.Normalize();
        shift.RotationAroundZAxis(-Math.PI * 0.5);
        shift.ScaleBy(width);
        startPoint.TranslateBy(shift);
        endPoint.TranslateBy(shift);
    }

    // center of groove chanell
    var halfGvoove = Spacial.CreateVector(startPoint, endPoint);
    halfGvoove.ScaleBy(0.5);
    var shift = cutDir.Copy();
    shift.Normalize();
    shift.RotationAroundZAxis(Math.PI * 0.5);
    shift.ScaleBy(width * 0.5);
    halfGvoove.X += shift.X;
    halfGvoove.Y += shift.Y;
    halfGvoove.Z += shift.Z;
    var centerGroove = startPoint.Copy();
    centerGroove.TranslateBy(halfGvoove);

    var toNewStart = Spacial.CreateVector(centerGroove, startPoint);
    var angle = cutDir.AngleTo(Spacial.CreateVector(1.0, 0.0, 0.0));
    toNewStart.RotationAroundZAxis(-angle);
    centerGroove.TranslateBy(toNewStart);
    var startPoint = centerGroove;

    return {
        "startPt": startPoint,
        "angle": angle,
        "length": length
    };
}
function getOpside(contour) {
    if (contour == null || contour == undefined)
        return 0; // Center
    if (contour.OffsetType == TrajectoryOffsetTypeEnum.Software)
        return 0; // Center         
    switch (contour.OffsetSide) {
        case OffsetSideEnum.Left:
            return 0; // Left
        case OffsetSideEnum.Right:
            return 1; // Right
        case OffsetSideEnum.Center:
            return 0; // Center
    }
    return 0; // Center
}
function getSide(sideAxis) {
    var zVplus = Spacial.CreateVector(0.0, 0.0, 1.0);
    if (zVplus.IsSameDirection(sideAxis))
        return 0;
    var xVplus = Spacial.CreateVector(1.0, 0.0, 0.0);
    if (xVplus.IsSameDirection(sideAxis))
        return 2;
    var yVplus = Spacial.CreateVector(0.0, 1.0, 0.0);
    if (yVplus.IsSameDirection(sideAxis))
        return 1;
    var yVminus = Spacial.CreateVector(0.0, -1.0, 0.0);
    if (yVminus.IsSameDirection(sideAxis))
        return 3;
    var xVminus = Spacial.CreateVector(-1.0, 0.0, 0.0);
    if (xVminus.IsSameDirection(sideAxis))
        return 4;
    var zVminus = Spacial.CreateVector(0.0, 0.0, -1.0);
    if (zVminus.IsSameDirection(sideAxis))
        return 5;
    return -1;
}
function getPoint(geometry) {
    return geometryStartPoint(geometry);
}
function getGrooveStartPoint(cutPath) {
    return geometryStartPoint(cutPath.Cut.Geometry[0]);
}
function getGrooveEndPoint(cutPath) {
    return geometryEndPoint(cutPath.Cut.Geometry[0]);
}
function getGrooveDirection(cutPath) {
    var cutLine = host.asType(Segment, cutPath.Cut.Geometry[0]);
    var direction = cutLine.Direction;
    return host.asType(Vector, direction);
}
function geometryStartPoint(geometry) {
    var point;
    switch (geometry.GeometryType) {
        case GeometryTypeEnum.Point:
            point = geometry;
            break;
        case GeometryTypeEnum.Segment:
            point = lineStartPoint(geometry);
            break;
        case GeometryTypeEnum.Arc:
            point = arcStartPoint(geometry);
            break;
        default:
            point = geometry;
            break;
    }
    var pt = host.asType(Point, point);
    return pt.ToReferenceCoordinateSystem();
}
function geometryEndPoint(geometry) {
    var point;
    switch (geometry.GeometryType) {
        case GeometryTypeEnum.Point:
            point = geometry;
            break;
        case GeometryTypeEnum.Segment:
            point = lineEndPoint(geometry);
            break;
        case GeometryTypeEnum.Arc:
            point = arcEndPoint(geometry);
            break;
        default:
            point = geometry;
            break;
    }
    var pt = host.asType(Point, point);
    return pt.ToReferenceCoordinateSystem();
}
function lineStartPoint(geometry) {
    var line = host.asType(Segment, geometry);
    return pointByPos(line, 'Start');
}
function lineEndPoint(geometry) {
    var line = host.asType(Segment, geometry);
    return pointByPos(line, 'End');
}
function arcStartPoint(geometry) {
    var arc = host.asType(Arc, geometry);
    return pointByPos(arc, 'Start');
}
function arcEndPoint(geometry) {
    var arc = host.asType(Arc, geometry);
    return pointByPos(arc, 'End');
}
function pointByPos(point, pos) {
    var pt;
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
function arcDrawDir(dir, angle) {
    angle = Math.abs(angle);
    if (dir) {
        if (angle <= Math.PI)
            dir = 1;
        else
            dir = 3;
    }
    else {
        if (angle <= Math.PI)
            dir = 2;
        else
            dir = 4;
    }
    return dir;
}
function toolCode(operation) {
    if (operation.Spindle.ToolIdentifiedBy == ToolSpecifyingEnum.ByCode)
        return operation.Spindle.Code;
    return '';
}

// format section start
function openCloseTag(tag, value) {
    var output = '';
    output = writeLn('<' + tag + '>' + value + '</' + tag + '>');
    return output;
}
function openTag(tag) {
    tagStack.push(tag);
    return writeLn('<' + tag + '>');
}
function closeTag() {
    var tag = tagStack.pop(tag);
    return writeLn('</' + tag + '>');;
}
function writeLn(line) {
    if (line.length == 0)
        return '';
    return line + newLineChar;
}
// format section end