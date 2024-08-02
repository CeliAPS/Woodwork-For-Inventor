/*
  Copyright (C) 2021-2024 by Celi APS, Inc.
  All rights reserved.

  JSON dump JavaScript postprocessor

  Date: 2023-03-03
*/

export var mandatorySettings = {
    description: 'JSON dump',
    legal: 'Copyright (C) 2021-2024 by Celi APS, Inc.',
    longDescription: 'Generic JSON post for full info dump',
    certificationLevel: 2,
    minimumRevision: 5,
    fileExtension: 'json',
    setCodePage: 'ascii',
    unit: 'cm',
    operationSort: 'ByOrder', // ByOrder, BySide, ByOperation
};

var level;
var doubleFormat = Utility.CreateFormat({ decimals: 5, trim: true, scale: 1.0 });
var intFormat = Utility.CreateFormat({ decimals: 0, trim: true, forceDecimal: false, scale: 1.0 });

export function sideTransforms(sizes, corner, callFromNesting) {
    return new Array();
}
export function onPostprocess() {
    level = -1;
    var fileName = 'FullDumpFor' + Job.Clampings[0].Part.Code;
    var content = '';
    content += parseObject(Job, null);
    content = content.slice(0, content.lastIndexOf(","));
    Utility.WriteFile(fileName, mandatorySettings.fileExtension, content, "allClamps");
    return;
}
function parseObject(obj, parent) {
    if (obj == null || obj == undefined)
        return '';

    if (obj.OperationType != undefined) {
        obj = collectOperationObject(obj, parent)
    }
    if (obj.TrajectoryType != undefined) {
        obj = collectTrajectoryObject(obj, parent)
    }
    if (obj.GeometryType != undefined) {
        obj = collectGeometryObject(obj, parent)
    }

    level++;
    var output = '{\n';
    if (typeof obj == 'object') {
        var properties = collectProperties(obj, parent);
        output += outputProps(obj, properties);
        var enums = collectEnums(obj, parent);
        output += outputEnums(obj, enums);
        var objects = collectObjects(obj, parent);

        objects.forEach(key => {
            output += '\n' + tabulation() + beautify(key) + ':';
            output += parseObject(obj[key], obj);
        });
    }
    level--;
    return output + tabulation() + '},\n';
}
function collectProperties(obj, parent) {
    var properties = new Array();
    for (var key in obj) {
        if (typeof obj[key] != 'object' && typeof obj[key] != 'function' && key != 'IsReadOnly') {
            properties.push(key);
        }
    }
    return Array.from(properties).sort();
}
function outputProps(obj, props) {
    var output = '';
    props.forEach(key => {
        output += tabulation() + beautify(key) + ':' + beautify(obj[key]) + ',\n';
    });
    return output;
}
function collectEnums(obj, parent) {
    var enums = new Array();
    for (var key in obj) {
        if (obj[key] == null || obj[key] == undefined) {
            continue;
        }
        if (typeof obj[key] == 'object' && isItEnum(key)) {
            enums.push(key);
        }
    }
    return Array.from(enums).sort();
}
function isItEnum(key) {
    return (
        key == 'ClampingCorner' ||
        key == 'ClampingBodyType' ||
        key == 'RotationDirection' ||
        key == 'ToolIdentifiedBy' ||
        key == 'OffsetType' ||
        key == 'OperationType' ||
        key == 'TrajectoryType' ||
        key == 'OffsetSide' ||
        key == 'GeometryType' ||
        key == 'LeadType' ||
        key == 'ContourGeometryType' ||
        key == 'CoverType' ||
        key == 'SawInitialPosition');
}
function outputEnums(obj, enums) {
    var output = '';
    enums.forEach(key => {
        output += tabulation() + beautify(key) + ':' + beautify(resolveEnum(obj, key)) + ',\n';
    });
    return output;
}
function collectObjects(obj, parent) {
    var insideObjects = new Array();
    for (var key in obj) {
        if (obj[key] == null && obj[key] == undefined) {
            continue;
        }
        if (typeof obj[key] == 'object' && !isItEnum(key)) {
            insideObjects.push(key);
        }
    }
    // do not sort Side objects   
    if (insideObjects.length > 0) {
        if (obj[insideObjects[0]].InclinedPlane !== undefined)
            return insideObjects;
    }
    return Array.from(insideObjects).sort();
}

function collectOperationObject(obj, parent) {
    var operation;
    switch (obj.OperationType) {
        case OperationTypeEnum.DrillOperation:
            operation = host.asType(DrillOperation, obj);
            break;
        case OperationTypeEnum.MillOperation:
            operation = host.asType(MillOperation, obj);
            break;
        case OperationTypeEnum.PocketOperation:
            operation = host.asType(PockOperation, obj);
            break;
        case OperationTypeEnum.CutOperation:
            operation = host.asType(CutOperation, obj);
            break;
        case OperationTypeEnum.GrooveOperation:
            operation = host.asType(GrooveOperation, obj);
            break;
        case OperationTypeEnum.NestingOperation:
            operation = host.asType(NestOperation, obj);
            break;
        case OperationTypeEnum.CalibrationOperation:
            operation = host.asType(MillCalibrationOperation, obj);
            break;
        case OperationTypeEnum.CutCalibrationOperation:
            operation = host.asType(CutCalibrationOperation, obj);
            break;
        case OperationTypeEnum.MacroOperation:
            operation = host.asType(MacroOperation, obj);
            break;
        default:
            operation = null;
            break;
    }
    return operation;
}
function collectTrajectoryObject(obj, parent) {
    var trajectory;
    switch (obj.TrajectoryType) {
        case TrajectoryTypeEnum.DrillTrajectory:
            trajectory = host.asType(DrillTrajectory, obj);
            break;
        case TrajectoryTypeEnum.MillTrajectory:
            trajectory = host.asType(MillTrajectory, obj);
            break;
        case TrajectoryTypeEnum.PocketTrajectory:
            trajectory = host.asType(PockTrajectory, obj);
            break;
        case TrajectoryTypeEnum.MillTrajectory:
            trajectory = host.asType(MillTrajectory, obj);
            break;
        case TrajectoryTypeEnum.CutTrajectory:
            trajectory = host.asType(CutTrajectory, obj);
            break;
        case TrajectoryTypeEnum.GrooveTrajectory:
            trajectory = host.asType(GrooveTrajectory, obj);
            break;
        case TrajectoryTypeEnum.NestingTrajectory:
            trajectory = host.asType(NestingTrajectory, obj);
            break;
        case TrajectoryTypeEnum.CalibrationTrajectory:
            trajectory = host.asType(MillCalibrationTrajectory, obj);
            break;
        case TrajectoryTypeEnum.CutCalibrationTrajectory:
            trajectory = host.asType(CutCalibrationTrajectory, obj);
            break;
        case TrajectoryTypeEnum.MacroTrajectory:
            trajectory = host.asType(MacroTrajectory, obj);
            break;
        default:
            trajectory = null;
            break;
    }
    return trajectory;
}
function collectGeometryObject(obj, parent) {
    var geometry;
    switch (obj.GeometryType) {
        case GeometryTypeEnum.Point:
            geometry = host.asType(Point, obj);
            break;
        case GeometryTypeEnum.Segment:
            geometry = host.asType(Segment, obj);
            break;
        case GeometryTypeEnum.Arc:
            geometry = host.asType(Arc, obj);
            break;
        default:
            geometry = null;
            break;
    }
    return geometry;
}
function beautify(value) {
    if (typeof (value) === 'boolean')
        return value;
    if (typeof (value) === 'number') {
        if (Number.isInteger(value))
            return intFormat.Output(value);
        else
            return doubleFormat.Output(value);
    }
    return '"' + value + '"';
}
function tabulation() {
    var output = '';
    var i = 0;
    while (i < level) {
        output += '\t';
        i++;
    }
    return output;
}
// enums
function resolveEnum(obj, enumName) {
    var output = '';
    if (obj == null || obj == undefined)
        return output;

    switch (enumName) {
        case 'ClampingCorner':
            output = resolveEnumClampingCorner(obj);
            break;
        case 'ClampingBodyType':
            output = resolveEnumClampingBodyType(obj);
            break;
        case 'RotationDirection':
            output = resolveEnumRotationDirection(obj);
            break;
        case 'OperationType':
            output = resolveEnumOperationType(obj);
            break;
        case 'TrajectoryType':
            output = resolveEnumTrajectoryType(obj);
            break;
        case 'GeometryType':
            output = resolveEnumGeometryType(obj);
            break;
        case 'OffsetType':
            output = resolveEnumOffsetType(obj);
            break;
        case 'OffsetSide':
            output = resolveEnumOffsetSide(obj);
            break;
        case 'ToolIdentifiedBy':
            output = resolveEnumToolSpecifying(obj);
            break;
        case 'LeadType':
            output = resolveEnumLeadType(obj);
            break;
        case 'ContourGeometryType':
            output = resolveEnumContourGeometryType(obj);
            break;
        case 'CoverType':
            output = resolveEnumCoverType(obj);
            break;
        default:
            output = '';
            break;
    }
    return output;
}
function resolveEnumClampingCorner(obj) {
    var output = '';
    switch (obj.ClampingCorner) {
        case ClampingCornerEnum.FrontLeft:
            output = 'FrontLeft';
            break;
        case ClampingCornerEnum.FrontRight:
            output = 'FrontRight';
            break;
        case ClampingCornerEnum.BackLeft:
            output = 'BackLeft';
            break;
        case ClampingCornerEnum.BackRight:
            output = 'BackRight';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumClampingBodyType(obj) {
    var output = '';
    switch (obj.ClampingBodyType) {
        case ClampingBodyTypeEnum.Workpiece:
            output = 'Workpiece';
            break;
        case ClampingBodyTypeEnum.WorkpieceWithOversize:
            output = 'WorkpieceWithOversize';
            break;
        case ClampingBodyTypeEnum.Part:
            output = 'Part';
            break;
        case ClampingBodyTypeEnum.PartWithoutCovers:
            output = 'PartWithoutCovers';
            break;
        case ClampingBodyTypeEnum.PartWithoutTopAndBottomCovers:
            output = 'PartWithoutTopAndBottomCovers';
            break;
        case ClampingBodyTypeEnum.PartWithoutSideCovers:
            output = 'PartWithoutSideCovers';
            break;
        case ClampingBodyTypeEnum.WorkpieceWithMainCoversAndOversize:
            output = 'WorkpieceWithMainCoversAndOversize';
            break;
        case ClampingBodyTypeEnum.WorkpieceWithMainCovers:
            output = 'WorkpieceWithMainCovers';
            break;
        case ClampingBodyTypeEnum.WorkpieceWithOversizeAndCalibration:
            output = 'WorkpieceWithOversizeAndCalibration';
            break;
        case ClampingBodyTypeEnum.WorkpieceWithOversizeCalibrationAndTopBottomCovers:
            output = 'WorkpieceWithOversizeCalibrationAndTopBottomCovers';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumRotationDirection(obj) {
    var output = '';
    switch (obj.RotationDirection) {
        case ToolRotationDirectionEnum.Clockwise:
            output = 'Clockwise';
            break;
        case ToolRotationDirectionEnum.Counterclockwise:
            output = 'Counterclockwise';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumOperationType(obj) {
    var output = '';
    switch (obj.OperationType) {
        case OperationTypeEnum.DrillOperation:
            output = 'DrillOperation';
            break;
        case OperationTypeEnum.MillOperation:
            output = 'MillOperation';
            break;
        case OperationTypeEnum.PocketOperation:
            output = 'PockOperation';
            break;
        case OperationTypeEnum.CutOperation:
            output = 'CutOperation';
            break;
        case OperationTypeEnum.GrooveOperation:
            output = 'GrooveOperation';
            break;
        case OperationTypeEnum.NestingOperation:
            output = 'NestingOperation';
            break;
        case OperationTypeEnum.CalibrationOperation:
            output = 'MillCalibrationOperation';
            break;
        case OperationTypeEnum.CutCalibrationOperation:
            output = 'CutCalibrationOperation';
            break;
        case OperationTypeEnum.Macro:
            output = 'MacroOperation';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumTrajectoryType(obj) {
    var output = '';
    switch (obj.TrajectoryType) {
        case TrajectoryTypeEnum.DrillTrajectory:
            output = 'DrillTrajectory';
            break;
        case TrajectoryTypeEnum.MillTrajectory:
            output = 'MillTrajectory';
            break;
        case TrajectoryTypeEnum.PocketTrajectory:
            output = 'PockTrajectory';
            break;
        case TrajectoryTypeEnum.MillTrajectory:
            output = 'MillTrajectory';
            break;
        case TrajectoryTypeEnum.CutTrajectory:
            output = 'CutTrajectory';
            break;
        case TrajectoryTypeEnum.GrooveTrajectory:
            output = 'GrooveTrajectory';
            break;
        case TrajectoryTypeEnum.NestingTrajectory:
            output = 'NestingTrajectory';
            break;
        case TrajectoryTypeEnum.CalibrationTrajectory:
            output = 'MillCalibrationTrajectory';
            break;
        case TrajectoryTypeEnum.CutCalibrationTrajectory:
            output = 'CutCalibrationTrajectory';
            break;
        case TrajectoryTypeEnum.MacroTrajectory:
            output = 'MacroTrajectory';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumGeometryType(obj) {
    var output = '';
    switch (obj.GeometryType) {
        case GeometryTypeEnum.Point:
            output = 'Direct';
            break;
        case GeometryTypeEnum.Segment:
            output = 'Tangent';
            break;
        case GeometryTypeEnum.Arc:
            output = 'Arc';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumOffsetSide(obj) {
    var output = '';
    switch (obj.OffsetSide) {
        case OffsetSideEnum.Left:
            output = 'Left';
            break;
        case OffsetSideEnum.Right:
            output = 'Right';
            break;
        case OffsetSideEnum.Center:
            output = 'Center';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumOffsetType(obj) {
    var output = '';
    switch (obj.OffsetType) {
        case TrajectoryOffsetTypeEnum.Hardware:
            output = 'Hardware';
            break;
        case TrajectoryOffsetTypeEnum.Software:
            output = 'Software';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumToolSpecifying(obj) {
    var output = '';
    switch (obj.ToolIdentifiedBy) {
        case ToolSpecifyingEnum.ByHoleDiameter:
            output = 'ByHoleDiameter';
            break;
        case ToolSpecifyingEnum.ByCode:
            output = 'ByCode';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumLeadType(obj) {
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
function resolveEnumContourGeometryType(obj) {
    var output = '';
    switch (obj.ContourGeometryType) {
        case ContourGeometryTypeEnum.Rectangular:
            output = 'Rectangular';
            break;
        case ContourGeometryTypeEnum.Circular:
            output = 'Circular';
            break;
        case ContourGeometryTypeEnum.Variant:
            output = 'Variant';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumCoverType(obj) {
    var output = '';
    switch (obj.CoverType) {
        case CoverTypeEnum.Paint:
            output = 'Paint';
            break;
        case CoverTypeEnum.EdgeBand:
            output = 'EdgeBand';
            break;
        case CoverTypeEnum.Veneer:
            output = 'Veneer';
            break;
        case CoverTypeEnum.VeneerMultilayerCover:
            output = 'VeneerMultilayerCover';
            break;
        case CoverTypeEnum.LiquidMultilayerCover:
            output = 'LiquidMultilayerCover';
            break;
        case CoverTypeEnum.VacuumFilm:
            output = 'VacuumFilm';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
// enums