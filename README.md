# js-state-forms

use forms with @stembord/state and @stembord/state-react

## createFormsStore

```ts
// "./lib/stores/forms"
import { state, Consumer } from "../path/to/state";

export const {
    create,
    remove,
    selectForm,
    selectField,
    updateField,
    removeField,
    store,
    injectForm,
    Field
} = createFormsStore(state, Consumer);
```

## Form

```tsx
// "./lib/components/Form"
import { injectForm, Field } from "../path/to/forms";

// create a component that can be used with Field Component
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
    constructor(props: IFormProps) {
        super(props);

        this.onSubmit = this.onSubmit.bind(this);
    }
    onSubmit() {
        const { resetForm, getForm } = this.props;

        console.log(getForm());
        resetForm();
    }
    render() {
        const { formId, valid } = this.props;

        return (
            <form>
                <Field formId={formId} name="name" Component={Input} />
                <Field formId={formId} name="age" Component={Input} />
                <input
                    type="submit"
                    onClick={onSubmit}
                    disabled={valid}
                    value="submit"
                />
            </form>
        );
    }
}

const ConnectedForm = injectForm({
    changeset: changeset => changeset
})(Form);
```
