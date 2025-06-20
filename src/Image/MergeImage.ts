import * as path from "path";
import * as fs from "fs";
import { UtilFT, UtilFunc } from "@zwa73/utils";
import { PkgImageCfg, PkgSpriteCfg, PkgTilesetCfg, PkgTilesetInfo, TilesetCfg } from "@sosarciel-cdda/schema";
import { ModTileset } from "@sosarciel-cdda/schema";
import { DataManager } from "@sosarciel-cdda/event";
import { TARGET_GFXPACK, getAnimPath, getGfxPackName, getImagePath, getOutImagePath, getOutImagePathAbs } from "@src/CMDefine";



/**图片信息 */
type ImageInfo = {
    /**图片设定 */
    sprite:PkgSpriteCfg;
    /**图集设定 */
    tileset:PkgTilesetCfg;
};

/**根据 PkgSpriteCfg 获得图片列表 */
function getImageFiles(cfg:PkgSpriteCfg):string[]{
    let subget = (imageCfg?:PkgImageCfg)=>{
        if(imageCfg===undefined) return [];
        const imageNames: string[] = [];

        if (typeof imageCfg === 'string')
            imageNames.push(imageCfg);
        else if (Array.isArray(imageCfg)) {
            for (let item of imageCfg) {
                if (typeof item === 'string')
                    imageNames.push(item);
                else if ('sprite' in item) {
                    if (typeof item.sprite === 'string')
                        imageNames.push(item.sprite);
                    else
                        imageNames.push(...item.sprite);
                }
            }
        } else if ('sprite' in imageCfg) {
            if (typeof imageCfg.sprite === 'string')
                imageNames.push(imageCfg.sprite);
            else
                imageNames.push(...imageCfg.sprite);
        }
        return imageNames;
    }
    return [...subget(cfg.fg),...subget(cfg.bg)];
}
/** 根据 PkgSpriteCfg 获得图集uid */
function getTilesetUID(cfg:PkgTilesetCfg):string{
    let W = cfg.sprite_width;
    let H = cfg.sprite_height;
    let result = `W${W}H${H}`;

    // 定义一个子函数来处理可选属性
    let concatSub = (shortName: string, value: number | undefined)=>{
        if (value !== undefined)
            result += `${shortName}${value}`;
    }
    // 使用子函数来处理每个可选属性
    concatSub('ox', cfg.sprite_offset_x);
    concatSub('oy', cfg.sprite_offset_y);
    concatSub('ps', cfg.pixelscale);
    concatSub('sa', cfg.sprites_across);

    return result;
}


/**使用py工具合并图像 输出为modtileset */
export async function mergeImage(dm:DataManager,charName:string,forcePackage:boolean=true){
    /**动画主目录 */
    const imagePath = getImagePath(charName);
    if(!(await UtilFT.pathExists(imagePath))) return;

    /**处理缓存目录 */
    const tmpPath = path.join(imagePath,"tmp");
    /**未处理的图片目录 */
    const rawPath = path.join(tmpPath,"raw");
    /**打包后的图片输出目录 */
    const mergePath = path.join(tmpPath,"merge");
    /**用于输出的图集表 */
    const tileSetMap:Record<string,PkgTilesetCfg> = {};

    //寻找图像配置
    const cfgFilepaths = await UtilFT.fileSearchGlob(imagePath,"*.json");
    for(const cfgPath of cfgFilepaths){
        const cfgJson:ImageInfo = (await UtilFT.loadJSONFile(cfgPath)) as ImageInfo;
        const tilesetcfg = cfgJson.tileset;
        //获取配置关联的所有图片
        const pngs = getImageFiles(cfgJson.sprite);

        //在缓存构建py脚本所需的特殊文件夹名
        const wxh = tilesetcfg.sprite_width+"x"+tilesetcfg.sprite_height;
        const uid = getTilesetUID(tilesetcfg);
        const tmpFolderPath = path.join(rawPath,`pngs_${uid}_${wxh}`);

        await UtilFT.ensurePathExists(tmpFolderPath,{dir:true});
        //复制png到缓存
        for(let pngName of pngs){
            pngName = pngName+".png";
            const pngPath = path.join(imagePath,pngName);
            const outPngPath = path.join(tmpFolderPath,pngName);
            await fs.promises.copyFile(pngPath,outPngPath);
        }

        //复制配置
        const cfgName = path.parse(cfgPath).name;
        await UtilFT.writeJSONFile(path.join(tmpFolderPath,cfgName),cfgJson.sprite);

        //注册入tileset表
        tileSetMap[uid] = tilesetcfg;
    }

    //创建tileset配置
    const rawinfo:PkgTilesetInfo=[{
            width:32,
            height:32,
            pixelscale:1
        },
        ...Object.keys(tileSetMap).map((uid)=>({
            [`${uid}.png`]:tileSetMap[uid]
        }))
    ]
    await UtilFT.writeJSONFile(path.join(rawPath,'tile_info.json'),rawinfo);
    const str = `NAME: ${charName}\n`     +
                `VIEW: ${charName}\n`     +
                `JSON: tile_config.json\n`+
                `TILESET: tiles.png`      ;
    await fs.promises.writeFile(path.join(rawPath,'tileset.txt'), str);
    //开始打包
    await UtilFT.ensurePathExists(mergePath,{dir:true});
    await UtilFunc.exec(`python "tools/compose.py" "${rawPath}" "${mergePath}"`);

    //读取打包结果
    const packageInfoPath = path.join(mergePath,'tile_config.json');
    const tilesetNew = (((await UtilFT.loadJSONFile(packageInfoPath))as any )["tiles-new"]! as TilesetCfg[])
        .filter(item => item.file!="fallback.png");
    const imgModTileset:ModTileset = {
        type: "mod_tileset",
        compatibility: [await getGfxPackName()],
        "tiles-new": tilesetNew.map(item=>{
            item.file = path.join(getOutImagePath(charName),item.file)
            return item;
        }),
    }

    dm.addData([imgModTileset],path.join(getOutImagePath(charName),"image_tileset"))

    //复制所有图片 到输出目录
    const charImgPath = getOutImagePathAbs(charName);
    await UtilFT.ensurePathExists(charImgPath,{dir:true});
    const pngs = (await fs.promises.readdir(mergePath))
        .filter(fileName=> path.parse(fileName).ext=='.png');
    for(let pngName of pngs){
        const pngPath = path.join(mergePath,pngName);
        const outPngPath = path.join(charImgPath,pngName);
        await fs.promises.copyFile(pngPath,outPngPath);
    }
}