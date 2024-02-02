import { CMDef } from "@src/CMDefine";
import { AnimType } from "./AnimTool";
import { AnyHook } from "cdda-event";
import { MutationID } from "cdda-schema";




/**获取对应角色的动画hook */
export const getAnimHook = (charName:string)=>`${charName}Anim` as AnyHook;

/**获取对应类型的动画变异ID */
export const getAnimTypeMutID = (charName:string,animType:AnimType)=> CMDef.genMutationID(`${charName}${animType}`);
/**获取主要动画变异ID */
export const getAnimMainMutID = (charName:string)=> `${charName}_anim` as MutationID;


