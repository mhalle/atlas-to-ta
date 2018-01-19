import sys
import json
from operator import itemgetter

ID_attributes = {
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
}

def listify(t):
    return t if type(t) == list else [t]

_blank_node_counter = 0
def blank_node_id():
    global _blank_node_counter
    _blank_node_counter += 1
    return '_:b{:0>5}'.format(_blank_node_counter)


def flatten(doc):
    blank_nodes = []
    for node in doc:
        for field_name, field_val in node.items():
            if not field_name in ID_attributes:
                continue
            field_val_list = listify(field_val)
            new_field_val = set()
            for v in field_val_list:
                if type(v) == str:
                    new_field_val.add(v)
                    continue
                try:
                    v_id = v['@id']
                except KeyError:
                    v_id = v['@id'] = blank_node_id()
                
                if not '@type' in v:
                    try:
                        v['@type'] = ID_attributes[field_name]['defaultType']
                    except KeyError:
                        pass
                new_field_val.add(v_id)
                blank_nodes.append(v)
            node[field_name] = list(new_field_val)
        try:
            node['@type'] = listify(node['@type'])
        except KeyError:
            pass
    # recurse if needed
    if blank_nodes:
        blank_nodes = flatten(blank_nodes)
    return doc + blank_nodes

def index_by_id(doc):
    id_table = {}
    # build the index
    for node in flatdoc:
        id_table[node['@id']] = node
    return id_table


def dereference(id_table):
    deref_table = {}
    # change ids to in-memory references
    for node_name, node in id_table.items():
        node_copy = {}
        for pred, obj_name_list in node.items():
            if pred not in ID_attributes:
                node_copy[pred] = node[pred]
                continue

            node_copy[pred] = [id_table[objname] for objname in obj_name_list]
        deref_table[node_name] = node_copy
    return deref_table

def reverse_id_index(doc):
    # create reverse id table
    revid_table = {}          
    for node in doc:
        for pred, objlist in node.items():
            if pred not in ID_attributes:
                continue
            for o in objlist:
                try:
                    revobj = revid_table[o['@id']]
                except KeyError:
                    revobj = revid_table[o['@id']] = {
                        '@id': node['@id'],
                        '@type': node['@type']
                    }
                try:
                    revsubj = revobj[pred]
                except KeyError:
                    revsubj = revobj[pred] = []
                if node not in revsubj:
                    revsubj.append(node)
    return revid_table

def index_by_type(doc):
    type_table = {}
    for node in doc:
        for pred, value in node.items():
            if pred != '@type':
                continue
            for typename in value:
                try:
                    type_entry = type_table[typename]
                except KeyError:
                    type_entry = type_table[typename] = []
                if node not in type_entry:
                    type_entry.append(node)

    return type_table

def node_has_type(node, types):
    types = listify(types)
    try:
        node_types = node['@type']
    except KeyError:
        return False
    for nt in node_types:
        for t in types:
            if nt == t:
                return True
    return False

def get_node_tree(node, fieldname=None, traversed=None):
    if not node:
        return []
    if traversed is None:
        traversed = set()
    if not fieldname:
        fieldname = 'member'
    
    for n in listify(node):
        if n in traversed:
            continue
        traversed.add(n)
        try:
            children = node[fieldname]
        except KeyError:
            continue
        for c in children:
            get_node_tree(children, fieldname, traversed)
    return iter(traversed)


class HAWG(object):
    def __init__(self, doc=None):
        self.id_table = {}
        self.revid_table = {}
        self.type_table = {}
        if doc:
            self.parse(doc)

    def parse(self, doc):
        flattened = flatten(doc)
        self.id_table = dereference(index_by_id(flattened))
        self.revid_table = dereference(reverse_index_by_id(flattened))
        self.type_table = index_by_type(self.id_table.values())

    def nodes(self):
        for n in self.id_table.values():
            yield n

    def get_header_node(self):
        return self.id_table['#__header__']


    def create_node(self, node_type, node_id=None, ):
        if node_id is None:
            node_id = blank_node_id()

        node_type = listify(node_type)
        node = {
            '@id': node_id,
            '@type': node_type
        }
        self.id_table[node['@id']] = node
        for t in node_type:
            if t not in self.type_table:
                self.type_table[t] = [node]
            else:
                self.type_table[t].append(node)
        return node

    def get_node_by_id(self, node_id):
        return self.id_table[node_id]

    def compose_field_values(self, node_or_id, field_name,  
                       modifier_type=None, subfields=None):
        try:
            node = self.id_table[node_or_id]
        except TypeError:
            node = node_or_id
        try:
            modifier_nodes = node[field_name]
        except KeyError:
            return {}
        
        if modifier_type:
            modifier_type = listify(modifier_type)

        modifier_dict = {}
        for a in modifier_nodes:
            if modifier_type and a.get('@type', None) not in modifier_type:
                continue
            for field, value in a.items():
                if field[0] == '@':
                    continue
                if subfields is not None and field not in subfields:
                    continue
                modifier_dict[field] = value
        return modifier_dict

    def get_nodes_with_annotation(self, 
                                filt=None,
                                node_type=None, 
                                annotation_type=None,
                                field_name=None):
        if not annotation_type:
            annotation_type = 'Annotation'
        if not field_name:
            field_name = 'annotation'
        if node_type:
            node_type = listify(node_type)
        
        annot_nodes = self.type_table[annotation_type]
        annot_nodes = filter(filt, self.type_table[annotation_type])
        annot_node_ids = [x['@id'] for x in annot_nodes]
        subj_nodes = []
        for i in annot_node_ids:
            subj_nodes.extend(self.revid_table[i][field_name])

        if node_type:
            subj_nodes = [n for n in subj_nodes if node_has_type(n, node_type)]
        return subj_nodes

if __name__ == '__main__':
    with open(sys.argv[1]) as fp:
        doc = json.load(fp)

        h = HAWG(doc)
        header = h.get_header_node()
        root = header['root']

        s = h.get_nodes_with_annotation(lambda x: x.get('name', None) == 'Muscles', node_type=['Structure', 'Group'])
        print([x['@id'] for x in s])
        for root in header['root']:
            print(root['@id'], h.compose_field_values(root, 'renderOption'),
            h.compose_field_values(root, 'annotation'))