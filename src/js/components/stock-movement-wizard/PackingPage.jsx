import _ from 'lodash';
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Form } from 'react-final-form';
import arrayMutators from 'final-form-arrays';
import PropTypes from 'prop-types';
import Alert from 'react-s-alert';
import update from 'immutability-helper';
import { confirmAlert } from 'react-confirm-alert';

import 'react-confirm-alert/src/react-confirm-alert.css';

import ArrayField from '../form-elements/ArrayField';
import TextField from '../form-elements/TextField';
import { renderFormField } from '../../utils/form-utils';
import LabelField from '../form-elements/LabelField';
import SelectField from '../form-elements/SelectField';
import apiClient, { flattenRequest } from '../../utils/apiClient';
import { showSpinner, hideSpinner } from '../../actions';
import PackingSplitLineModal from './modals/PackingSplitLineModal';
import { debouncedUsersFetch } from '../../utils/option-utils';

const FIELDS = {
  packPageItems: {
    type: ArrayField,
    virtualized: true,
    fields: {
      productCode: {
        type: LabelField,
        flexWidth: '0.7',
        label: 'Code',
      },
      productName: {
        type: LabelField,
        label: 'Product Name',
        flexWidth: '3',
        attributes: {
          className: 'text-left ml-1',
        },
      },
      binLocationName: {
        type: LabelField,
        label: 'Bin Location',
        flexWidth: '1',
      },
      lotNumber: {
        type: LabelField,
        label: 'Lot/Serial No',
        flexWidth: '1',
      },
      expirationDate: {
        type: LabelField,
        label: 'Expires',
        flexWidth: '1',
      },
      quantityShipped: {
        type: LabelField,
        label: 'Shipped',
        flexWidth: '0.8',
      },
      uom: {
        type: LabelField,
        label: 'UOM',
        flexWidth: '0.8',
      },
      recipient: {
        type: SelectField,
        label: 'Recipient',
        flexWidth: '2.5',
        fieldKey: '',
        attributes: {
          async: true,
          required: true,
          showValueTooltip: true,
          openOnClick: false,
          autoload: false,
          loadOptions: debouncedUsersFetch,
          cache: false,
          options: [],
          labelKey: 'name',
        },
      },
      palletName: {
        type: TextField,
        label: 'Pallet',
        flexWidth: '0.8',
      },
      boxName: {
        type: TextField,
        label: 'Box',
        flexWidth: '0.8',
      },
      splitLineItems: {
        type: PackingSplitLineModal,
        label: 'Split Line',
        flexWidth: '1',
        fieldKey: '',
        attributes: {
          title: 'Split Line',
          btnOpenText: 'Split Line',
          btnOpenClassName: 'btn btn-outline-success',
        },
        getDynamicAttr: ({
          fieldValue, rowIndex, onSave, formValues,
        }) => ({
          lineItem: fieldValue,
          onSave: splitLineItems => onSave(formValues, rowIndex, splitLineItems),
        }),
      },
    },
  },
};

/**
 * The fifth step of stock movement(for movements from a depot) where user can see the
 * packing information.
 */
class PackingPage extends Component {
  constructor(props) {
    super(props);

    this.state = {
      values: { ...this.props.initialValues, packPageItems: [] },
    };

    this.saveSplitLines = this.saveSplitLines.bind(this);

    this.props.showSpinner();
  }

  componentDidMount() {
    this.fetchAllData();
  }

  /**
   * Fetches all required data.
   * @public
   */
  fetchAllData() {
    this.fetchLineItems().then((resp) => {
      const { packPageItems } = resp.data.data.packPage;
      this.setState({ values: { ...this.state.values, packPageItems } });
      this.props.hideSpinner();
    }).catch(() => {
      this.props.hideSpinner();
    });
  }

  /**
   * Saves packing data
   * @param {object} formValues
   * @public
   */
  save(formValues) {
    this.props.showSpinner();
    this.savePackingData(formValues.packPageItems)
      .then((resp) => {
        const { packPageItems } = resp.data.data.packPage;
        this.setState({ values: { ...this.state.values, packPageItems } });
        this.props.hideSpinner();
        Alert.success('Changes saved successfully!');
      })
      .catch(() => this.props.hideSpinner());
  }

  /**
   * Refetch the data, all not saved changes will be lost.
   * @public
   */
  refresh() {
    confirmAlert({
      title: 'Confirm refresh',
      message: 'Are you sure you want to refresh? Your progress since last save will be lost.',
      buttons: [
        {
          label: 'Yes',
          onClick: () => this.fetchAllData(),
        },
        {
          label: 'No',
        },
      ],
    });
  }

  /**
   * Transition to next stock movement status
   * @public
   */
  transitionToNextStep() {
    const url = `/openboxes/api/stockMovements/${this.state.values.stockMovementId}/status`;
    const payload = { status: 'CHECKING' };

    return apiClient.post(url, payload);
  }

  /**
   * Fetches 5th step data from current stock movement.
   * @public
   */
  fetchLineItems() {
    const url = `/openboxes/api/stockMovements/${this.state.values.stockMovementId}?stepNumber=5`;

    return apiClient.get(url)
      .then(resp => resp)
      .catch(err => err);
  }

  /**
   * Saves current stock movement progress (line items) and goes to the next stock movement step.
   * @param {object} formValues
   * @public
   */
  nextPage(formValues) {
    this.props.showSpinner();
    this.savePackingData(formValues.packPageItems)
      .then(() => {
        this.transitionToNextStep()
          .then(() => {
            this.props.hideSpinner();
            this.props.onSubmit(formValues);
          })
          .catch(() => this.props.hideSpinner());
      })
      .catch(() => this.props.hideSpinner());
  }

  /**
   * Saves packing data
   * @param {object} packPageItems
   * @public
   */
  savePackingData(packPageItems) {
    const updateItemsUrl = `/openboxes/api/stockMovements/${this.state.values.stockMovementId}`;
    const payload = {
      id: this.state.values.stockMovementId,
      stepNumber: '5',
      packPageItems,
    };

    if (payload.packPageItems.length) {
      return apiClient.post(updateItemsUrl, flattenRequest(payload))
        .catch(() => Promise.reject(new Error('Could not save requisition items')));
    }

    return Promise.resolve();
  }

  /**
   * Saves split line items
   * @param {object} formValues
   * @param {number} lineItemIndex
   * @param {object} splitLineItems
   * @public
   */
  saveSplitLines(formValues, lineItemIndex, splitLineItems) {
    this.props.showSpinner();
    this.savePackingData(update(formValues.packPageItems, {
      [lineItemIndex]: {
        splitLineItems: { $set: splitLineItems },
      },
    }))
      .then((resp) => {
        const { packPageItems } = resp.data.data.packPage;
        this.setState({ values: { ...this.state.values, packPageItems } });
        this.props.hideSpinner();
      })
      .catch(() => this.props.hideSpinner());
  }

  render() {
    return (
      <Form
        onSubmit={values => this.nextPage(values)}
        mutators={{ ...arrayMutators }}
        initialValues={this.state.values}
        render={({ handleSubmit, values, invalid }) => (
          <div className="d-flex flex-column">
            <span>
              <button
                type="button"
                onClick={() => this.refresh()}
                className="float-right mb-1 btn btn-outline-secondary align-self-end ml-1 btn-xs"
              >
                <span><i className="fa fa-refresh pr-2" />Refresh</span>
              </button>
              <button
                type="button"
                disabled={invalid}
                onClick={() => this.save(values)}
                className="float-right mb-1 btn btn-outline-secondary align-self-end btn-xs"
              >
                <span><i className="fa fa-save pr-2" />Save</span>
              </button>
            </span>
            <form onSubmit={handleSubmit}>
              {_.map(FIELDS, (fieldConfig, fieldName) => renderFormField(fieldConfig, fieldName, {
                onSave: this.saveSplitLines,
                formValues: values,
              }))}
              <div>
                <button type="button" className="btn btn-outline-primary btn-form btn-xs" onClick={() => this.props.previousPage(values)}>
                  Previous
                </button>
                <button type="submit" className="btn btn-outline-primary btn-form float-right btn-xs">Next</button>
              </div>
            </form>
          </div>
        )}
      />
    );
  }
}

const mapStateToProps = state => ({
  recipients: state.users.data,
  recipientsFetched: state.users.fetched,
});

export default (connect(mapStateToProps, {
  showSpinner, hideSpinner,
})(PackingPage));

PackingPage.propTypes = {
  /** Initial component's data */
  initialValues: PropTypes.shape({}).isRequired,
  /** Function returning user to the previous page */
  previousPage: PropTypes.func.isRequired,
  /**
   * Function called with the form data when the handleSubmit()
   * is fired from within the form component.
   */
  onSubmit: PropTypes.func.isRequired,
  /** Function called when data is loading */
  showSpinner: PropTypes.func.isRequired,
  /** Function called when data has loaded */
  hideSpinner: PropTypes.func.isRequired,
};
