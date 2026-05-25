use serde::{Deserialize, Serialize};

const DEFAULT_SYNTAX_PROFILE_ID: &str = "ctn-default";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteRecord {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) source: String,
    pub(crate) syntax_profile_id: String,
    pub(crate) syntax_version: i64,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CtnMarkerRule {
    marker: String,
    #[serde(rename = "type")]
    block_type: String,
    label: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CtnSyntaxProfile {
    id: String,
    name: String,
    version: i64,
    space_indent_unit: i64,
    marker_rules: Vec<CtnMarkerRule>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum NoteTreeNode {
    #[serde(rename = "folder")]
    Folder {
        id: String,
        title: String,
        children: Vec<NoteTreeNode>,
    },
    #[serde(rename = "note")]
    Note {
        id: String,
        #[serde(rename = "noteId")]
        note_id: String,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteWorkspace {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) active_note_id: Option<String>,
    #[serde(default = "default_syntax_profile_id")]
    pub(crate) default_syntax_profile_id: String,
    #[serde(default = "default_syntax_profiles")]
    pub(crate) syntax_profiles: Vec<CtnSyntaxProfile>,
    pub(crate) notes: Vec<NoteRecord>,
    pub(crate) tree: Vec<NoteTreeNode>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInfo {
    pub(crate) path: String,
}

pub(crate) fn default_syntax_profile_id() -> String {
    DEFAULT_SYNTAX_PROFILE_ID.to_string()
}

pub(crate) fn default_syntax_profiles() -> Vec<CtnSyntaxProfile> {
    vec![CtnSyntaxProfile {
        id: DEFAULT_SYNTAX_PROFILE_ID.to_string(),
        name: "默认 CTN 语法".to_string(),
        version: 1,
        space_indent_unit: 2,
        marker_rules: vec![
            marker_rule("[理解]", "personal-understanding", "理解"),
            marker_rule("[条件]", "condition", "条件"),
            marker_rule("[证据]", "evidence", "证据"),
            marker_rule("[反例]", "counterexample", "反例"),
            marker_rule("[组分]", "component", "组分"),
            marker_rule("[分类]", "category", "分类"),
            marker_rule("[例子]", "example", "例子"),
            marker_rule("[注]", "note", "注释"),
            marker_rule("[?]", "question", "疑问"),
            marker_rule(":", "definition", "定义"),
            marker_rule("#", "concept", "主题"),
            marker_rule("=", "definition", "定义"),
            marker_rule("?", "question", "疑问"),
            marker_rule("-", "condition", "条件"),
            marker_rule("+", "action", "行动"),
        ],
    }]
}

fn marker_rule(marker: &str, block_type: &str, label: &str) -> CtnMarkerRule {
    CtnMarkerRule {
        marker: marker.to_string(),
        block_type: block_type.to_string(),
        label: label.to_string(),
    }
}
