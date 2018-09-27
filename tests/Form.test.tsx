import * as tape from "tape";
import { JSDOM } from "jsdom";
import * as React from "react";
import * as Enzyme from "enzyme";
import * as EnzymeAdapter from "enzyme-adapter-react-16";
import { State } from "@stembord/state";
import { createContext } from "@stembord/state-react";
import { createFormsStore, IInjectedFormProps, IInputProps } from "../lib";

const dom = new JSDOM("<!doctype html><html><body></body></html>");

(global as any).document = dom.window.document;
(global as any).window = dom.window;

const state = new State(),
    { Consumer, Provider } = createContext(state.getState()),
    { selectField, Field, injectForm } = createFormsStore(state, Consumer);

Enzyme.configure({ adapter: new EnzymeAdapter() });

const Input: React.ComponentType<Partial<IInputProps>> = ({
    value,
    onChange,
    onBlur,
    onFocus
}: Partial<IInputProps>) => (
    <input
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
    />
);

interface IFormProps extends IInjectedFormProps {}

class Form extends React.PureComponent<IFormProps> {
    render() {
        const { formId } = this.props;

        return (
            <form>
                <Field formId={formId} name="name" Component={Input} />
            </form>
        );
    }
}

const ConnectedForm = injectForm({
    changeset: changeset => changeset
})(Form);

interface IRootState {
    value: { [key: string]: any };
}

class Root extends React.Component<{}, IRootState> {
    formRef: React.RefObject<any>;

    constructor(props: {}) {
        super(props);

        this.formRef = React.createRef();

        this.state = {
            value: state.getState()
        };

        state.on("set-state", value => {
            this.setState({ value });
        });
    }

    render() {
        return (
            <Provider value={this.state.value}>
                <ConnectedForm ref={this.formRef} key="form" />
            </Provider>
        );
    }
}

tape("connect update", (assert: tape.Test) => {
    const wrapper = Enzyme.mount(React.createElement(Root)),
        formId = (wrapper.instance() as Root).formRef.current.formId;

    assert.equals(
        ((wrapper.instance() as Root).formRef.current.constructor as any)
            .displayName,
        "Form(Form)",
        "should wrap component name"
    );

    wrapper.find("input").simulate("change", { target: { value: "text" } });

    assert.equals(
        selectField(state.getState(), formId, "name").get("value"),
        "text",
        "store's value should update"
    );

    assert.end();
});
