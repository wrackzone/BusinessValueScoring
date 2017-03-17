var Ext = window.Ext4 || window.Ext;
Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    launch: function() {
        var that = this;

        // console.log(that.getSettings());
        that.TimeCriticalityField = that.getSetting('TimeCriticalityField');
        that.RROEValueField = that.getSetting('RROEValueField');
        that.UserBusinessValueField = that.getSetting('UserBusinessValueField');
        that.WSJFScoreField = that.getSetting('WSJFScoreField');
        that.JobSizeField = that.getSetting('JobSizeField');
        that.ShowValuesAfterDecimal = that.getSettingsFields('ShowValuesAfterDecimal');
        // that.FieldsText = that.getSetting("Fields");
        // that.Fields = [];

        // // trim the fields.
        // if (!_.isUndefined(that.FieldsText)&&!_.isNull(that.FieldsText)) {
        //     that.Fields = that.FieldsText.split(",");
        //     _.each(that.Fields,function(field){ 
        //         field = field.trim();
        //     });
        // }
        that.calculatedFields = that._getCalculatedFields();

        that.Weightings = JSON.parse(that.getSetting("Weightings"));
        that.ValueMappings = JSON.parse(that.getSetting("ValueMappings"));
        console.log("w",that.Weightings);
        console.log("v",that.ValueMappings);
        
        this._grid = null;
        this._piCombobox = this.add({
            xtype: "rallyportfolioitemtypecombobox",
            padding: 5,
            listeners: {
                //ready: this._onPICombobox,
                select: this._onPICombobox,
                scope: this
            }
        });
    },

    _getCalculatedFields : function() {

        var settingName = "CalculatedField";
        var cfs = [];

        for( x = 1; x <= 2; x++) {
            var fieldText = this.getSetting('CalculatedField'+x);
            var calcField = {};
            if (!_.isUndefined(fieldText)&&!_.isNull(fieldText)&&(fieldText!="")) {
                var parts = fieldText.split(",");
                calcField["field"] = parts[0];
                calcField["formula"] = parts[1];
                cfs.push(calcField);
            }
        }
        return cfs;
    },

    _getWeightings : function() {

        return this.Weightings;

    },

    _getValueMappings : function() {

        return this.ValueMappings;

    },



    // returns true if the value should be mapped.
    _isMappableField : function(fieldName,record) {

        var value = record.get(fieldName);

        // console.log("value",value,typeof(value),parseInt(""+value),!_.isNaN(parseInt(""+value)));

        // dont map if empty, or a numeric value.
        if ( _.isNull(value) || value==""|| _.isNumber(value)||
             !_.isNaN(parseInt(""+value)) )
            return false;
        else    
            return true;
    },

    _mapValue : function(value,field) {

        console.log("mapping",value,field);

        var mappings = this._getValueMappings();
        var key = _.has(mappings,field) ? field : 'default';
        console.log("key",key)
        var mapping = mappings[key];
        console.log("mapping",mapping,mapping[value]);
        return _.has(mapping,value) ? mapping[value] : 0;
    },

    _applyWeigthing : function( fieldName, value ) {

        var weightings = this._getWeightings();

        if ( _.has( weightings, fieldName ) )
            return value * weightings[fieldName];
        else
            return value;
    },

    _calcValue : function(record,calcField) {

        var that = this;
        var regex = /\w{2,50}/g ;

        var replacer = function(fieldName) {

            var value;

            if (that._isMappableField(fieldName,record)) 
                value =  that._mapValue(record.get(fieldName),fieldName);
            else
                value = record.get(fieldName);

            return that._applyWeigthing( fieldName, value );
        }
        // use regex to get field names from formula
        // replace with values
        // then eval it.
        var formula = calcField['formula'].replace(regex,replacer);
        var value;

        try {
            value = eval(formula);
        } catch (e) {
            return {
                value : 0,
                error : e.message
            }
        }
        console.log("formula:",formula,"value",value);

        return {
            value : value,
            error : null
        }
    },
    
    _onPICombobox: function() {
        var selectedType = this._piCombobox.getRecord();
        var model = selectedType.get('TypePath');
        
        if (this._grid !== null) {
            this._grid.destroy();
        }

        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: [ model ],
            listeners: {
                load: function(store) {
                    var records = store.getRootNode().childNodes;
                    this._calculateScore(records);
                },
                update: function(store, rec, modified, opts) {
                    this._calculateScore([rec]);
                },
                scope: this
            },
           // autoLoad: true,
            enableHierarchy: true
        }).then({
            success: this._onStoreBuilt,
            scope: this
        });
    },
    
    _onStoreBuilt: function(store, records) {
        //var records = store.getRootNode().childNodes;
  
        var selectedType = this._piCombobox.getRecord();
        var modelNames = selectedType.get('TypePath');

        var columns = ['Name'];
        
        var context = this.getContext();
        this._grid = this.add({
            xtype: 'rallygridboard',
            context: context,
            modelNames: [ modelNames ],
            toggleState: 'grid',
            stateful: false,
            plugins: [
                {
                    ptype: 'rallygridboardcustomfiltercontrol',
                    filterChildren: false,
                    filterControlConfig: {
                        modelNames: [ modelNames ],
                        stateful: true,
                        stateId: context.getScopedStateId('custom-filter-example')
                    }
                },
                {
                    ptype: 'rallygridboardfieldpicker',
                    headerPosition: 'left',
                    modelNames: [ modelNames ],
                    stateful: true,
                    stateId: context.getScopedStateId('columns-example')
                },
                {
                    ptype: 'rallygridboardactionsmenu',
                    menuItems: [
                        {
                            text: 'Export...',
                            handler: function() {
                                window.location = Rally.ui.grid.GridCsvExport.buildCsvExportUrl(
                                    this.down('rallygridboard').getGridOrBoard());
                            },
                            scope: this
                        }
                    ],
                    buttonConfig: {
                        iconCls: 'icon-export'
                    }
                }
            ],
            gridConfig: {
                store: store,
                // columnCfgs: [
                //     'Name',
                //     'c_SalesProfitability', 'RROEValue', 'UserBusinessValue', 'JobSize', 
                //     this.getSetting("useExecutiveMandateField")===true ? this.getSetting("ExecutiveMandateField") : null,
                //     {
                //         text: "WSJF Score",
                //         dataIndex: "WSJFScore",
                //         editor: null
                //     }
                // ]
                columnCfgs : columns
            },
            height: this.getHeight()
        });
    },
    
    _calculateScore: function(records)  {
        var that = this;

        Ext.Array.each(records, function(feature) {
            _.each(that.calculatedFields,function(calcField) {
                var value = that._calcValue(feature,calcField);
                if (_.isNull(value.error))
                    feature.set(calcField.field, value.value);
                else
                    console.log("formula error:",value.error)
            })
        })
        //     var jobSize = feature.data.JobSize;
        //     var execMandate = that.getSetting("useExecutiveMandateField")===true ? feature.data[that.getSetting("ExecutiveMandateField")] : 1;
        //     execMandate = _.isUndefined(execMandate) || _.isNull(execMandate) || execMandate === 0 ? 1 : execMandate;
            
        //     var timeValue = feature.data[that.TimeCriticalityField];
        //     var OERR      = feature.data[that.RROEValueField];
        //     var userValue = feature.data[that.UserBusinessValueField];
        //     var oldScore  = feature.data[that.WSJFScoreField];
        //     var isChecked = that.getSetting("ShowValuesAfterDecimal");
            
        //     if (jobSize > 0) { // jobSize is the denominator so make sure it's not 0
        //         var score;
    
        //         if( !isChecked ) {
        //             score = ( ((userValue + timeValue + OERR ) * execMandate) / jobSize);
        //             score = Math.round(score);
        //         }
        //         else {
        //             score = Math.floor(((userValue + timeValue + OERR ) * execMandate / jobSize) * 100)/100;
        //         }

        //         if (oldScore !== score) { // only update if score changed
        //             feature.set('WSJFScore', score); // set score value in db
        //         }
        //     }
        // });
    },
    
    getSettingsFields : function() {
        var values = [
            /*{
                name: 'ShowValuesAfterDecimal',
                xtype: 'rallycheckboxfield',
                label : "Show Values After the Decimal",
                labelWidth: 200
            },
            {
                name: 'useExecutiveMandateField',
                xtype: 'rallycheckboxfield',
                label : "Use Custom Executive Mandate Field",
                labelWidth: 200
            },
            {
                name: 'ExecutiveMandateField',
                xtype: 'rallytextfield',
                label : "Executive Mandate Field",
                labelWidth: 200
            },
            {
                name: 'TimeCriticalityField',
                xtype: 'rallytextfield',
                label : "Time Criticality Field",
                labelWidth: 200
            },
            {
                name: 'RROEValueField',
                xtype: 'rallytextfield',
                label : "RROEValue Field",
                labelWidth: 200
            },
            {
                name: 'UserBusinessValueField',
                xtype: 'rallytextfield',
                label : "User Business Value Field",
                labelWidth: 200
            },
            {
                name: 'WSJFScoreField',
                xtype: 'rallytextfield',
                label : "WSJFScore Field",
                labelWidth: 200
            },
            {
                name: 'JobSizeField',
                xtype: 'rallytextfield',
                label : "Job Size Field",
                labelWidth: 200
            },
            {
                name: 'Fields',
                width : 400,
                xtype: 'rallytextfield',
                label : "Fields",
                labelWidth: 200
            },*/
            {
                name: 'CalculatedField1',
                width : 800,
                xtype: 'rallytextfield',
                label : "Calculated Field 1",
                labelWidth: 200
            },
            {
                name: 'CalculatedField2',
                width : 800,
                xtype: 'rallytextfield',
                label : "Calculated Field 2",
                labelWidth: 200
            },
            {
                name: 'ValueMappings',
                width : 800,
                xtype:'textareafield',
                grow: true,
                label : "Field Value Mappings",
                labelWidth: 200
            },
            {
                name: 'Weightings',
                width : 800,
                xtype:'textareafield',
                grow: true,
                label : "Field Value Weightings",
                labelWidth: 200
            }



        ];

        return values;
    },

    config: {
        defaultSettings : {
            ValueMappings : _getValueMappingsString(),
            Weightings    : _getWeightingsString(),
            CalculatedField1 : "",
            CalculatedField2 : "",
            // ShowValuesAfterDecimal: false,
            // useExecutiveMandateField : false,
            // ExecutiveMandateField : 'c_ExecutiveMandate',
            // TimeCriticalityField : 'TimeCriticality',
            // RROEValueField : 'RROEValue',
            // UserBusinessValueField : 'UserBusinessValue',
            // WSJFScoreField : 'WSJFScore',
            // JobSizeField : 'JobSize',
            // Fields : ''
        }
    }
});
