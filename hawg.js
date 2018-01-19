let shortid = require('shortid');
let _ = require('lodash');

let ID_attributes = {
    'root': {
        '@type': '@id'
    },
    'sourceSelector': {
        '@type': '@id',
        'defaultType': 'Selector'
    },
    'member': {
        '@type': '@id'
    },
    'baseURL': {
        '@type': '@id',
        'defaultType': 'BaseURL'
    },
    'backgroundImage': {
        '@type': '@id',
        'defaultType': 'DataSource'
    },
    'dataSource': {
        '@type': '@id',
        'defaultType': 'DataSource'

    },
    'annotation': {
        '@type': '@id',
        'defaultType': 'Annotation'

    },
    'renderOption': {
        '@type': '@id',
        'defaultType': 'Style'
    }
};

function new_node_id() {
    let sid = shortid.generate();
    return `_:b${sid}`;
}

function flatten_doc(doc) {
    return _.flatMap(doc, flatten_node);
}

function index_doc(doc) {
    let index = {};
    _.forIn(doc, node => {
        index[node['@id']] = node
    });
    return index;
}

function reverse_node_index(node_index) {
    let rev_index = {};
    _.forOwn(node_index, (node, node_name) => {
        rev_index[node_name] = {
            '@id': node['@id']
        };
        if (_.has(node, '@type')) {
            rev_index[node_name]['@type'] = node['@type']
        }
    });

    _.forOwn(node_index, node => {
        _.forOwn(node, (field_value, field_name) => {
            if(_.has(ID_attributes, field_name)) {
                _.forEach(field_value, obj_node => {

                    let rev_subj = rev_index[obj_node['@id']];
                    let rev_obj = node;
                    if(!_.has(rev_subj, field_name)) {
                        rev_subj[field_name] = [];
                    }
                    if(!_.has(rev_subj[field_name], rev_obj)) {
                        rev_subj[field_name].push(rev_obj);
                    }
                });
            }
        });
    });
    return rev_index;
}

function dereference(node_index, existing_index) {
    let ret_index = _.mapValues(node_index, node => _.clone(node));
    let ret_index_nodes = _.values(ret_index);
    _.forOwn(ret_index_nodes, node => {
        _.forOwn(node, (field_value, field_name) => {
            if (_.has(ID_attributes, field_name)) {
                let ret = _.map(field_value, x => ret_index[x]);
                node[field_name] = ret;
            }
            else {
                node[field_name] = field_value;
            }
        });
    });
    return ret_index;
}

function compose_field_values(node, field_name, opts) {
    opts = opts || {}
    let modifier_type = opts.modifier_type ? _.castArray(opts.modifier_type) : null;
    let subfields = opts.subfields || null;

    if(!_.has(node, field_name)) {
        return {}
    }
    let modifier_dict = {};
    let modifier_nodes = node[field_name];
    _.forEach(modifier_nodes, mnode => {
        if (!modifier_type || _.includes(modifier_type, _.get(mnode, '@type', null))) {
            _.forOwn(mnode, (value, field) => {
                if (field[0] !== '@' && (!subfields || _.includes(subfields, field))) {
                    modifier_dict[field] = value;
                }
            });
        }
    });
    return modifier_dict;
}

function flatten_node(node) {
    let new_node_list = [];
    let node_copy = {};

    let flattened = _.mapValues(node, (field_value, field_name) => {
        if (!_.has(ID_attributes, field_name)) {
            return field_value;
        }
        else {
            let field_value_list = _.uniq(_.castArray(field_value));
            let new_field_values = [];
            _.forEach(field_value_list, field_value => {
                if (_.isString(field_value)) {
                    // must be a reference, and that's OK
                    new_field_values.push(field_value);
                }
                else {
                    // must be an object
                    // create a new node that is a copy of old so we can modify with @id and possibly @type
                    var field_value_node = _.clone(field_value);
                    if (!_.has(field_value_node, '@id')) {
                        field_value_node['@id'] = new_node_id();
                    }
                    if (!_.has(field_value_node, '@type') && _.has(ID_attributes[field_name], 'defaultType')) {
                        field_value_node['@type'] = ID_attributes[field_name]['defaultType'];
                    }
                    new_field_values.push(field_value_node['@id']);
                    new_node_list = new_node_list.concat(flatten_node(field_value_node));
                }
            });
            return new_field_values;
        }
    });
    // make sure @type is an array
    if(_.has(flattened, '@type')) {
        flattened['@type'] = _.castArray(flattened['@type']);
    }
    new_node_list.push(flattened);
    return new_node_list;
}

function merge_indexed_docs(doc_index0, doc_index1) {
    return _.assignInWith({}, doc_index0, doc_index1, (node0, node1) => {
        if(!_.isUndefined(node0)){
            return merge_nodes(node0, node1);
        }
    });
}

function merge_nodes(n0, n1) {
    return _.assignInWith({}, n0, n1, (n0val, n1val, field_name) => {
        if (_.has(ID_attributes, field_name) && !_.isUndefined(n0val)) {
            return _.uniq(_.concat(n0val, n1val));
        }
    });
}

function clone_node(n) {
    return _.clone(n);
}


class HAWG {
    constructor(doc) {
        this.id_table = {};
        this.node_table = {};
        this.reverse_node_table = {};
        if (doc) {
            this.parse(doc)
        };
    }

    parse(doc) {
        let indexed_doc = index_doc(flatten_doc(doc));
        this.id_table = merge_indexed_docs(this.id_table, indexed_doc);
        this.node_table = dereference(this.id_table);
        this.reverse_node_table = reverse_node_index(this.node_table);
    }


    get_node_by_id(id) {
        return this.node_table[id];
    }

    get_nodes_by_id(idlist) {
        return _.map(idlist, i => this.node_table[i]);
    }

    get_node_parent(node, fieldname) {
        fieldname = fieldname || 'member';
        return this.reverse_node_table[node['@id']][fieldname];
    }

    get_nodes() {
        return _.values(this.node_table);
    }

    get_header() {
        return this.node_table['#__header__'];
    }

    reverse_node(node) {
        return this.reverse_node_table[node['@id']];
    }

    get_ancestors(node, field_name) {
        field_name = field_name || 'member';

        var rev_ptr = this.reverse_node_table[node['@id']];
        let ancestors = [];
        while (true) {
            if(!_.has(rev_ptr, field_name)) {
                break;
            }
            // follow only one chain for now (hence the [0])
            let rev_ancestor = rev_ptr[field_name][0];
            let rev_ancestor_id = rev_ancestor['@id'];
            // detect a circular reference
            if(_.includes(ancestors, rev_ancestor_id)) {
                break;
            }
            ancestors.push(rev_ancestor_id);
            rev_ptr = rev_ancestor;
        }
        return _.map(ancestors, x=>this.node_table[x]);
    }
}

function get_node_tree(node, fieldname) {
    if (!node) {
        return [];
    }
    fieldname = fieldname || 'member';
    return _.flatMap(_.castArray(node), n => {
        if (node_has_type(n, 'Structure') || !_.has(n, fieldname)) {
            return n;
        }
        var member_results = get_node_tree(n[fieldname], fieldname);
        member_results.push(n);
        return member_results;
    });
}

function node_has_type(node, type_to_match) {
    let type_to_match_list = _.castArray(type_to_match);
    if (!_.has(node, '@type')) {
        return false;
    }
    let node_type = _.castArray(node['@type']);

    for (let t of type_to_match_list) {
        if (_.includes(node_type, t)) {
            return true;
        }
    }
    return false;
}
    
module.exports = {
    flatten_doc, 
    index_doc, 
    flatten_node, 
    new_node_id, 
    dereference, 
    compose_field_values,
    merge_nodes,
    merge_indexed_docs,
    clone_node,
    get_node_tree,
    node_has_type,
    HAWG
};
