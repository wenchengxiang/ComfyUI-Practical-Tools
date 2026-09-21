# Practical-Tools 节点包 - 静态导入所有节点模块
# 这样 ComfyUI 内置扩展管理器可以通过静态分析识别节点归属

# 逐个导入模块（单个失败不影响其他）
_modules = []

def _safe_import(module_name):
    try:
        mod = __import__(f"{__name__}.{module_name}", fromlist=[module_name])
        _modules.append(mod)
        return True
    except Exception as e:
        print(f"\n[WCX Nodes Error] 节点模块 {module_name} 加载失败: {e}\n")
        return False

# 所有节点模块列表
_node_modules = [
    "Any_Compare", "Any_Convert", "Any_Index", "Any_Length",
    "Any_Passthrough", "Any_Rerouter", "Any_Switch", "Any_To_End",
    "Audio_Duration", "Audio_Pass", "Batch_loop_Accumulate",
    "Blockify_Mask", "Boolean_Not", "Bus_In_Out", "Create_List",
    "Folder_Image_Load", "Folder_Video_Concat", "Free_Memory",
    "Image_Batch", "Image_Batch_Count_XYZ", "Image_Batch_Interleave",
    "Image_Batch_Interleave_Split", "Image_Batch_List", "Image_Blend",
    "Image_Blend_Mask_Center", "Image_Crop_and_Uncrop", "Image_Grid_Table",
    "Image_Pad", "Image_Tile_Untile", "Image_Transform_Rotate",
    "Index_Anything", "Is_Mask_Black", "Krea2_Cond_Rebalance",
    "Link_Switch", "Load_Image_Batch_From_Dir", "Loops",
    "Lora_Load_With_Trigger", "Lying_Sampler", "Mask_Batch",
    "Mask_Batch_List", "Mask_Batch_Replace_Empty", "Mask_Blur",
    "Mask_Brightness", "Mask_Fill_Holes", "Mask_From_Batch",
    "Mask_Grow", "Math", "Max_Resolution_Filter", "ModelScope_API",
    "Prompt_Replace", "Random_Integer", "Random_Path",
    "Repeat_Mask_Batch", "Reverse_Image_Batch", "RTX_Super_Resolution",
    "String_To_Combo", "Text_Image", "Text_Line_To_List",
    "Upscale_Model_Selector", "Virtual_Nodes", "WD14_Tagger",
]

for _name in _node_modules:
    _safe_import(_name)

# 合并所有节点映射
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

for _mod in _modules:
    if hasattr(_mod, "NODE_CLASS_MAPPINGS"):
        NODE_CLASS_MAPPINGS.update(_mod.NODE_CLASS_MAPPINGS)
    if hasattr(_mod, "NODE_DISPLAY_NAME_MAPPINGS"):
        NODE_DISPLAY_NAME_MAPPINGS.update(_mod.NODE_DISPLAY_NAME_MAPPINGS)

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
